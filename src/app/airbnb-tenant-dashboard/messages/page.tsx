"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, MessageCircle } from "lucide-react";
import { useCsrfToken } from "@/hooks/useCsrfToken";

type Message = {
  id: string;
  sender: "guest" | "host";
  message: string;
  createdAt: string;
};

type ConversationResponse = {
  success: boolean;
  message?: string;
  messages?: Message[];
};

export default function AirbnbGuestMessagesPage() {
  const { csrfToken } = useCsrfToken();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const fetchThread = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/airbnb-tenant/messages", { credentials: "include" });
      const json: ConversationResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to load messages.");
      setMessages(Array.isArray(json.messages) ? json.messages : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages.");
    } finally {
      setIsLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, []);

  useEffect(() => {
    fetchThread();
  }, [fetchThread]);

  const canSend = useMemo(() => text.trim().length > 0 && !isSending, [text, isSending]);

  const sendMessage = async () => {
    if (!csrfToken) {
      setError("Missing CSRF token. Refresh and try again.");
      return;
    }
    if (!text.trim()) return;

    setIsSending(true);
    setError(null);
    try {
      const res = await fetch("/api/airbnb-tenant/messages", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ message: text.trim() }),
      });
      const json: ConversationResponse = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "Failed to send message.");
      setText("");
      await fetchThread();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em]">Support</p>
        <h1 className="text-2xl font-bold text-foreground mt-2">Message the owner</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Use this secure channel to reach the owner/host for anything you need during your stay.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="surface-card rounded-3xl p-6">
        <div className="rounded-2xl border border-border bg-white/70 p-4 h-[46vh] overflow-y-auto space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading conversation…</p>
          ) : messages.length === 0 ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <MessageCircle size={16} /> No messages yet. Say hello.
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  m.sender === "guest"
                    ? "ml-auto bg-primary text-white"
                    : "mr-auto bg-white text-foreground border border-border"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{m.message}</p>
                <p className={`mt-2 text-[10px] ${m.sender === "guest" ? "text-white/80" : "text-muted-foreground"}`}>
                  {new Date(m.createdAt).toLocaleString("en-KE")}
                </p>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 flex items-end gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your message…"
            rows={3}
            className="w-full resize-none rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            disabled={isSending}
          />
          <button
            onClick={sendMessage}
            disabled={!canSend}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Send size={16} />
            Send
          </button>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Tip: Include your request and a preferred contact number if you want a callback.
        </p>
      </div>
    </div>
  );
}

