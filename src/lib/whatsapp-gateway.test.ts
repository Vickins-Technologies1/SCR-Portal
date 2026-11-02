import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptWhatsAppApiKey } from "./whatsapp-crypto";
import { normalizeOpenWaStatus, enqueueOpenWaText, processOpenWaOutbox, validateGatewayUrl } from "./whatsapp-gateway";
import { ObjectId } from "mongodb";

process.env.WHATSAPP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.JWT_SECRET = "test-jwt-secret-with-more-than-32-characters";

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

  it("queues a normalized Kenyan phone with encrypted content before gateway submission", async () => {
    const updateOne = vi.fn(async () => ({ upsertedCount: 1 }));
    const attempts = { updateOne };
    const db = { collection: () => attempts } as never;
    const fetch = vi.fn();
    globalThis.fetch = fetch as typeof globalThis.fetch;

    const result = await enqueueOpenWaText(db, "0712345678", "Hello", { type: "test", authorizedTest: true });
    expect(result).toMatchObject({ success: true, status: "queued" });
    expect(updateOne).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: expect.any(String) }), expect.objectContaining({ $setOnInsert: expect.objectContaining({ status: "queued", recipientMasked: "254••••678", encryptedPayload: expect.any(String) }) }), { upsert: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records a gateway timeout as unknown instead of blindly resending", async () => {
    const encrypted = encryptWhatsAppApiKey("test-openwa-key");
    const writes: Array<Record<string, unknown>> = [];
    const job = { _id: new ObjectId(), idempotencyKey: "attempt-key", encryptedPayload: encryptWhatsAppApiKey(JSON.stringify({ phone: "254712345678", message: "Hello" })), attempts: 0, authorizedTest: true };
    const attempts = {
      findOneAndUpdate: async () => job,
      updateOne: async (_filter: unknown, update: Record<string, unknown>) => { writes.push(update); return { modifiedCount: 1 }; },
      updateMany: async () => ({ modifiedCount: 0 }),
    };
    const events = { find: () => ({ sort: () => ({ toArray: async () => [] }) }) };
    const db = { collection: (name: string) => name === "systemSettings" ? { findOne: async () => ({ gatewayUrl: "https://gateway.example", sessionId: "main", apiKeyEncrypted: encrypted, enabled: true }) } : name === "whatsappDeliveryEvents" ? events : attempts } as never;
    const timeout = new Error("timeout"); timeout.name = "TimeoutError";
    globalThis.fetch = vi.fn(async () => { throw timeout; }) as typeof globalThis.fetch;
    const result = await processOpenWaOutbox(db, 1);
    expect(result).toMatchObject({ processed: 1 });
    expect(writes.some((write) => (write.$set as Record<string, unknown>)?.status === "unknown")).toBe(true);
  });

  it("rejects invalid numbers without contacting the gateway", async () => {
    const fetch = vi.fn(); globalThis.fetch = fetch as typeof globalThis.fetch;
    const result = await enqueueOpenWaText({ collection: () => ({}) } as never, "123", "Hello", { type: "test" });
    expect(result).toMatchObject({ success: false, status: "rejected" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
