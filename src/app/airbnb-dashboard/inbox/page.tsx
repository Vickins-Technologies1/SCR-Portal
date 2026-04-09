"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Send, Sparkles, Mail, Phone, MessageSquareText, X, Search } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
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
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState({ id: "", title: "", body: "", language: "en" });
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [search, setSearch] = useState("");
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

  const refreshTemplates = useCallback(async () => {
    if (!ownerId) return;
    const res = await fetch(`/api/airbnb/message-templates?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setTemplates(data.templates || []);
    }
  }, [ownerId]);

  const openTemplateModal = (template?: AirbnbMessageTemplate) => {
    setTemplateMessage(null);
    if (template) {
      setTemplateForm({
        id: template.id,
        title: template.title,
        body: template.body,
        language: template.language || "en",
      });
    } else {
      setTemplateForm({ id: "", title: "", body: "", language: "en" });
    }
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async () => {
    if (!csrfToken) {
      setTemplateMessage("Missing session token. Refresh and try again.");
      return;
    }
    if (!templateForm.title.trim() || !templateForm.body.trim()) {
      setTemplateMessage("Template title and body are required.");
      return;
    }

    setIsSavingTemplate(true);
    setTemplateMessage(null);
    try {
      const isEditing = Boolean(templateForm.id);
      const res = await fetch("/api/airbnb/message-templates", {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          id: templateForm.id || undefined,
          title: templateForm.title,
          body: templateForm.body,
          language: templateForm.language as "en" | "sw",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save template");
      }
      setShowTemplateModal(false);
      await refreshTemplates();
    } catch (err) {
      setTemplateMessage(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!csrfToken) {
      setTemplateMessage("Missing session token. Refresh and try again.");
      return;
    }
    try {
      const res = await fetch("/api/airbnb/message-templates", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ id: templateId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to delete template");
      }
      await refreshTemplates();
    } catch (err) {
      setTemplateMessage(err instanceof Error ? err.message : "Failed to delete template");
    }
  };

  useEffect(() => {
    if (!selectedId && conversations.length > 0) {
      setSelectedId(conversations[0].id);
    }
  }, [conversations, selectedId]);

  const selectedConversation = useMemo(
    () => conversations.find((convo) => convo.id === selectedId) || null,
    [conversations, selectedId]
  );

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((convo) =>
      `${convo.guestName} ${convo.listingName}`.toLowerCase().includes(term)
    );
  }, [conversations, search]);

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
    setIsAiLoading(false);
    setMessageStatus("AI reply drafting is not configured yet.");
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
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <MessageCircle className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Airbnb Module</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Guest Communication</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Unified inbox with automated templates and Swahili-ready messaging.
                  </p>
                </div>
              </div>
              <button
                onClick={handleAiReply}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold"
              >
                <Sparkles size={16} className={isAiLoading ? "animate-pulse" : ""} />
                {isAiLoading ? "Drafting..." : "AI reply"}
              </button>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:gap-6 lg:min-h-[520px] lg:h-[calc(100svh-260px)] lg:max-h-[calc(100svh-260px)]">
            <div className="surface-card rounded-3xl p-4 sm:p-5 flex flex-col lg:h-full lg:overflow-hidden">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-white/70 px-3 py-2 text-xs text-muted-foreground">
                <Search className="h-4 w-4" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search guests or listings..."
                  className="w-full bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="mt-4 space-y-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="surface-card rounded-2xl p-4 h-20 animate-pulse" />
                    ))}
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="surface-card rounded-2xl p-6 text-center text-xs text-muted-foreground">
                    No conversations yet.
                  </div>
                ) : (
                  filteredConversations.map((convo) => {
                    const isActive = selectedId === convo.id;
                    return (
                      <button
                        key={convo.id}
                        onClick={() => setSelectedId(convo.id)}
                        className={`w-full text-left rounded-2xl p-4 transition-all border ${
                          isActive
                            ? "border-primary/40 bg-primary/10 shadow-sm"
                            : "border-transparent hover:bg-primary/5"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{convo.guestName}</p>
                            <p className="text-[10px] text-muted-foreground">{convo.listingName}</p>
                          </div>
                          {convo.unread > 0 && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {convo.unread}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                          {convo.lastMessage || "No message preview"}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {new Date(convo.lastMessageAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="surface-card rounded-3xl flex flex-col min-h-[520px] lg:min-h-0 lg:h-full lg:overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                      Airbnb Inbox
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {selectedConversation ? selectedConversation.guestName : "Select a conversation"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {selectedConversation ? selectedConversation.listingName : "No active thread"}
                    </p>
                  </div>
                </div>
                {selectedConversation && (
                  <div className="text-[11px] text-muted-foreground">
                    Last message{" "}
                    {new Date(selectedConversation.lastMessageAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-[11px] text-muted-foreground space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Conversation</p>
                  {selectedConversation ? (
                    <>
                      <p>
                        Replying to{" "}
                        <span className="font-semibold text-foreground">{selectedConversation.guestName}</span>{" "}
                        for {selectedConversation.listingName}
                      </p>
                      <div className="grid gap-2">
                        <div className="flex items-center gap-2">
                          <Mail size={14} />
                          <span>{selectedConversation.guestEmail || "Email not on file"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone size={14} />
                          <span>{selectedConversation.guestPhone || "Phone not on file"}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">
                        Latest: {selectedConversation.lastMessage || "No message preview"}
                      </p>
                    </>
                  ) : (
                    <p>Select a conversation to view guest details.</p>
                  )}
                </div>

                <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-[11px] text-muted-foreground space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Templates</p>
                    <button
                      onClick={() => openTemplateModal()}
                      className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Add template
                    </button>
                  </div>
                  {templateMessage && !showTemplateModal && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                      {templateMessage}
                    </div>
                  )}
                  <div className="space-y-2">
                    {templates.length === 0 ? (
                      <div className="rounded-2xl border border-border bg-white/70 px-3 py-3 text-[11px] text-muted-foreground">
                        No message templates yet.
                      </div>
                    ) : (
                      templates.map((template) => (
                        <div
                          key={template.id}
                          onClick={() => {
                            handleTemplateClick(template.body);
                            setSelectedTemplateId(template.id);
                          }}
                          className="rounded-2xl border border-border bg-white/70 px-3 py-3 text-[11px] text-muted-foreground cursor-pointer hover:bg-white"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-foreground">{template.title}</p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openTemplateModal(template);
                                }}
                                className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                              >
                                Edit
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteTemplate(template.id);
                                }}
                                className="text-[10px] font-semibold text-red-600 hover:text-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 line-clamp-2">{template.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-[11px] text-muted-foreground space-y-3">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Delivery logs</p>
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

              <div className="border-t border-border px-5 py-4 space-y-3">
                <textarea
                  rows={3}
                  className="w-full rounded-2xl border border-border bg-white/70 px-4 py-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Type a message or select a template..."
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                />
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                  <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    Delivery channels
                  </span>
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={handleSendMessage}
                    disabled={isSending}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                  >
                    <Send size={14} />
                    {isSending ? "Sending..." : "Send message"}
                  </button>
                  {messageStatus && (
                    <p className="text-[11px] text-muted-foreground">{messageStatus}</p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {showTemplateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
              <div className="modal-panel w-full max-w-lg overflow-hidden">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      {templateForm.id ? "Edit template" : "Create template"}
                    </h2>
                    <p className="text-[11px] text-muted-foreground">Save reusable Airbnb messages.</p>
                  </div>
                  <button onClick={() => setShowTemplateModal(false)} className="modal-close rounded-full p-1">
                    <X size={18} />
                  </button>
                </div>
                <div className="modal-body modal-stagger space-y-4">
                  {templateMessage && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {templateMessage}
                    </div>
                  )}
                  <input
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Template title"
                    value={templateForm.title}
                    onChange={(event) => setTemplateForm((prev) => ({ ...prev, title: event.target.value }))}
                  />
                  <textarea
                    rows={5}
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Template body"
                    value={templateForm.body}
                    onChange={(event) => setTemplateForm((prev) => ({ ...prev, body: event.target.value }))}
                  />
                  <select
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    value={templateForm.language}
                    onChange={(event) => setTemplateForm((prev) => ({ ...prev, language: event.target.value }))}
                  >
                    <option value="en">English</option>
                    <option value="sw">Swahili</option>
                  </select>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowTemplateModal(false)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveTemplate}
                      disabled={isSavingTemplate}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      {isSavingTemplate ? "Saving..." : "Save template"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
