import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptWhatsAppApiKey } from "./whatsapp-crypto";
import { normalizeOpenWaStatus, sendOpenWaText, validateGatewayUrl } from "./whatsapp-gateway";

process.env.WHATSAPP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

describe("OpenWA gateway adapter", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

  it("requires HTTPS outside local development and rejects embedded credentials", () => {
    expect(validateGatewayUrl("https://gateway.example/")).toBe("https://gateway.example");
    expect(() => validateGatewayUrl("http://gateway.example")).toThrow("HTTPS");
    expect(() => validateGatewayUrl("https://user:pass@gateway.example")).toThrow("credentials");
  });

  it("maps only recognized OpenWA session states", () => {
    expect(normalizeOpenWaStatus("ready")).toBe("connected");
    expect(normalizeOpenWaStatus("qr_ready")).toBe("qr_required");
    expect(normalizeOpenWaStatus("connecting")).toBe("connecting");
    expect(normalizeOpenWaStatus("stopped")).toBe("disconnected");
    expect(normalizeOpenWaStatus("surprise")).toBe("unknown");
  });

  it("submits a normalized Kenyan phone to the documented OpenWA text route", async () => {
    const encrypted = encryptWhatsAppApiKey("test-openwa-key");
    const updateOne = vi.fn(async () => ({ upsertedCount: 1 }));
    const attempts = { updateOne, insertOne: vi.fn(async () => ({})) };
    const db = { collection: (name: string) => name === "systemSettings" ? { findOne: async () => ({ _id: "openwa", gatewayUrl: "https://gateway.example", sessionId: "main", apiKeyEncrypted: encrypted }) } : attempts } as never;
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("X-API-Key")).toBe("test-openwa-key");
      expect(JSON.parse(String(init?.body))).toEqual({ chatId: "254712345678@c.us", text: "Hello" });
      return new Response(JSON.stringify({ id: "gateway-id" }), { status: 201 });
    });
    globalThis.fetch = fetch as typeof globalThis.fetch;

    const result = await sendOpenWaText(db, "0712345678", "Hello", { type: "test" });
    expect(result).toMatchObject({ success: true, status: "submitted", gatewayMessageId: "gateway-id" });
    expect(String(fetch.mock.calls[0][0])).toBe("https://gateway.example/api/sessions/main/messages/send-text");
    expect(updateOne).toHaveBeenCalledWith(expect.objectContaining({ _id: expect.anything() }), expect.objectContaining({ $set: expect.objectContaining({ status: "submitted" }) }));
  });

  it("records a timeout as unknown instead of resending", async () => {
    const encrypted = encryptWhatsAppApiKey("test-openwa-key");
    const writes: Array<Record<string, unknown>> = [];
    const attempts = { updateOne: async (_filter: unknown, update: Record<string, unknown>) => { writes.push(update); return { upsertedCount: 1 }; }, insertOne: async () => ({}) };
    const db = { collection: (name: string) => name === "systemSettings" ? { findOne: async () => ({ gatewayUrl: "https://gateway.example", sessionId: "main", apiKeyEncrypted: encrypted }) } : attempts } as never;
    const timeout = new Error("timeout"); timeout.name = "TimeoutError";
    globalThis.fetch = vi.fn(async () => { throw timeout; }) as typeof globalThis.fetch;
    const result = await sendOpenWaText(db, "+254712345678", "Hello");
    expect(result).toMatchObject({ success: false, status: "unknown", error: "submission_outcome_unknown" });
    expect(writes.some((write) => (write.$set as Record<string, unknown>)?.status === "unknown")).toBe(true);
  });

  it("rejects invalid numbers without contacting the gateway", async () => {
    const fetch = vi.fn(); globalThis.fetch = fetch as typeof globalThis.fetch;
    const result = await sendOpenWaText({ collection: () => ({}) } as never, "123", "Hello");
    expect(result).toMatchObject({ success: false, status: "rejected" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
