"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, Sparkles, Mail, Phone, MessageSquareText } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbConversation, AirbnbMessageTemplate, AirbnbMessageDelivery } from "@/types/airbnb";

export default function AirbnbInboxPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("notifications:view");
  const [conversations, setConversations] = useState<AirbnbConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [messageStatus, setMessageStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [templates, setTemplates] = useState<AirbnbMessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [deliveryChannels, setDeliveryChannels] = useState({
    email: false,
    sms: false,
    whatsapp: false,
  });
  const [deliveryLogs, setDeliveryLogs] = useState<AirbnbMessageDelivery[]>([]);

  const fetchConversations = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/messages?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setConversations(data.conversations || []);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchConversations();
    }
  }, [hasAccess, fetchConversations]);

  useEffect(() => {
    if (!ownerId || !hasAccess) return;
    const fetchTemplates = async () => {
      const res = await fetch(`/api/airbnb/message-templates?ownerId=${ownerId}`, { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setTemplates(data.templates || []);
      }
    };
    fetchTemplates();
  }, [ownerId, hasAccess]);

  useEffect(() => {
    if (!selectedId && conversations.length > 0) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations, selectedId]);

  const selectedConversation = useMemo(
    () => conversations.find((convo) => convo.id === selectedId) || null,
    [conversations, selectedId]
  );

  useEffect(() => {
    if (!selectedConversation) return;
    setDeliveryChannels({
      email: !!selectedConversation.guestEmail,
      sms: !!selectedConversation.guestPhone,
      whatsapp: !!selectedConversation.guestPhone,
    });
    setSelectedTemplateId(null);
    setMessageStatus(null);
    setDeliveryLogs([]);
    if (!ownerId) return;
    const fetchLogs = async () => {
      const res = await fetch(
        `/api/airbnb/messages/logs?ownerId=${ownerId}&conversationId=${selectedConversation.id}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.success) {
        setDeliveryLogs(data.deliveries || []);
      }
    };
    fetchLogs();
  }, [selectedConversation, ownerId]);

  const handleTemplateClick = (templateBody: string) => {
    setMessageBody(templateBody);
  };

  const handleAiReply = () => {
    if (!selectedConversation) {
      setMessageStatus("Select a conversation to draft an AI reply.");
      return;
    }
    setIsAiLoading(true);
    const suggestion = `Hi ${selectedConversation.guestName}, thanks for reaching out! Here are the details for ${selectedConversation.listingName}. Let us know if you need anything else.`;
    setTimeout(() => {
      setMessageBody(suggestion);
      setIsAiLoading(false);
    }, 400);
  };

  const handleSendMessage = async () => {
    if (!csrfToken) {
      setMessageStatus("Missing session token. Refresh and try again.");
      return;
    }
    if (!selectedConversation) {
      setMessageStatus("Select a conversation before sending a message.");
      return;
    }
    if (!messageBody.trim()) {
      setMessageStatus("Enter a message to send.");
      return;
    }

    setIsSending(true);
    setMessageStatus(null);
    try {
      const selectedChannels = Object.entries(deliveryChannels)
        .filter(([, value]) => value)
        .map(([key]) => key);

      const res = await fetch("/api/airbnb/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          conversationId: selectedConversation.id,
          message: messageBody.trim(),
          templateId: selectedTemplateId || undefined,
          guestEmail: selectedConversation.guestEmail,
          guestPhone: selectedConversation.guestPhone,
          deliveryChannels: selectedChannels,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send message");
      }
      setMessageBody("");
      setSelectedTemplateId(null);
      setMessageStatus("Message sent successfully.");
      await fetchConversations();
      if (data.deliveries) {
        setDeliveryLogs(
          data.deliveries.map((delivery: any, idx: number) => ({
            id: `${idx}-${Date.now()}`,
            channel: delivery.channel,
            recipient: delivery.recipient || "",
            status: delivery.status,
            provider: delivery.provider,
            message: delivery.error,
            createdAt: new Date().toISOString(),
          }))
        );
      }
    } catch (err) {
      setMessageStatus(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Guest Communication"
            subtitle="Unified inbox with automated templates and Swahili-ready messaging."
            icon={MessageCircle}
            actions={
              <button
                onClick={handleAiReply}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold"
              >
                <Sparkles size={16} className={isAiLoading ? "animate-pulse" : ""} />
                {isAiLoading ? "Drafting..." : "AI reply"}
              </button>
            }
          />

          <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-foreground mb-4">Conversations</h2>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {conversations.map((convo) => (
                    <div
                      key={convo.id}
                      onClick={() => setSelectedId(convo.id)}
                      className={`rounded-2xl border border-border px-4 py-3 flex items-center justify-between gap-4 cursor-pointer transition ${
                        selectedId === convo.id ? "bg-primary/10 border-primary/30" : "bg-white/70 hover:bg-white"
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-foreground">{convo.guestName}</p>
                        <p className="text-xs text-muted-foreground">{convo.listingName}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                          {convo.lastMessage}
                        </p>
                      </div>
                      <div className="text-right text-[11px] text-muted-foreground space-y-1">
                        <p>{new Date(convo.lastMessageAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                        {convo.unread > 0 && (
                          <span className="inline-flex items-center justify-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                            {convo.unread} new
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-5">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-foreground mb-3">Quick reply</h2>
                {selectedConversation && (
                  <div className="mb-3 rounded-xl border border-border bg-white/70 px-3 py-2 text-[11px] text-muted-foreground">
                    Replying to <span className="font-semibold text-foreground">{selectedConversation.guestName}</span>{" "}
                    for {selectedConversation.listingName}
                  </div>
                )}
                {selectedConversation && (
                  <div className="mb-4 grid gap-2 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail size={14} />
                      <span>{selectedConversation.guestEmail || "Email not on file"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={14} />
                      <span>{selectedConversation.guestPhone || "Phone not on file"}</span>
                    </div>
                  </div>
                )}
                <textarea
                  rows={5}
                  className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-xs text-foreground"
                  placeholder="Type a message or select a template..."
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                />
                <div className="mt-3 rounded-2xl border border-border bg-white/70 px-3 py-3 text-[11px] text-muted-foreground space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Delivery channels</p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={deliveryChannels.email}
                      disabled={!selectedConversation?.guestEmail}
                      onChange={(event) =>
                        setDeliveryChannels((prev) => ({ ...prev, email: event.target.checked }))
                      }
                    />
                    Email
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={deliveryChannels.sms}
                      disabled={!selectedConversation?.guestPhone}
                      onChange={(event) =>
                        setDeliveryChannels((prev) => ({ ...prev, sms: event.target.checked }))
                      }
                    />
                    SMS
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={deliveryChannels.whatsapp}
                      disabled={!selectedConversation?.guestPhone}
                      onChange={(event) =>
                        setDeliveryChannels((prev) => ({ ...prev, whatsapp: event.target.checked }))
                      }
                    />
                    WhatsApp
                  </label>
                </div>
                <button
                  onClick={handleSendMessage}
                  disabled={isSending}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                >
                  <Send size={14} />
                  {isSending ? "Sending..." : "Send message"}
                </button>
                {messageStatus && (
                  <p className="mt-2 text-[11px] text-muted-foreground">{messageStatus}</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em] mb-3">
                  Templates
                </p>
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => {
                        handleTemplateClick(template.body);
                        setSelectedTemplateId(template.id);
                      }}
                      className="rounded-2xl border border-border bg-white/70 px-3 py-3 text-[11px] text-muted-foreground cursor-pointer hover:bg-white"
                    >
                      <p className="font-semibold text-foreground">{template.title}</p>
                      <p className="mt-1 line-clamp-2">{template.body}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em] mb-3">
                  Delivery logs
                </p>
                <div className="space-y-2">
                  {deliveryLogs.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-white/70 px-3 py-3 text-[11px] text-muted-foreground">
                      No delivery activity yet.
                    </div>
                  ) : (
                    deliveryLogs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-2xl border border-border bg-white/70 px-3 py-3 text-[11px] text-muted-foreground"
                      >
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1">
                            <MessageSquareText size={12} />
                            {log.channel.toUpperCase()}
                          </span>
                          <span className={log.status === "sent" ? "text-emerald-600" : "text-amber-600"}>
                            {log.status}
                          </span>
                        </div>
                        <p className="mt-1">{log.recipient || "Recipient unknown"}</p>
                        {log.message && <p className="mt-1 text-[10px] text-amber-700">{log.message}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
