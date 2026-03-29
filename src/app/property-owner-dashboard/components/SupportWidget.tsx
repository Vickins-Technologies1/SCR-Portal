"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Cookies from "js-cookie";
import {
  MessageCircle,
  Send,
  X,
  Sparkles,
  PencilLine,
  Trash2,
  Check,
  Paperclip,
  FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SupportMessage {
  _id: string;
  ownerId: string;
  senderRole: "propertyOwner" | "admin";
  senderName?: string;
  message: string;
  createdAt: string;
  updatedAt?: string;
  attachments?: {
    url: string;
    name: string;
    type: string;
    size: number;
  }[];
}

export default function SupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState<string | null>(() => Cookies.get("role") || null);
  const [presence, setPresence] = useState({
    adminOnline: false,
    adminTyping: false,
    adminLastSeen: null as string | null,
  });

  useEffect(() => {
    setRole(Cookies.get("role") || null);
  }, []);

  const attachmentPreviews = useMemo(
    () =>
      attachments.map((file) => ({
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      })),
    [attachments]
  );

  useEffect(() => {
    return () => {
      attachmentPreviews.forEach((item) => {
        if (item.preview) {
          URL.revokeObjectURL(item.preview);
        }
      });
    };
  }, [attachmentPreviews]);

  const canShow = role === "propertyOwner";

  const fetchCsrfToken = useCallback(async () => {
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data = await res.json();
      if (data.success && data.csrfToken) {
        setCsrfToken(data.csrfToken);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (canShow) {
      fetchCsrfToken();
    }
  }, [canShow, fetchCsrfToken]);

  const fetchMessages = useCallback(async () => {
    if (!canShow) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/support/messages", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [canShow]);

  const fetchPresence = useCallback(async () => {
    if (!canShow) return;
    try {
      const res = await fetch("/api/support/presence", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setPresence({
          adminOnline: Boolean(data.admin?.online),
          adminTyping: Boolean(data.admin?.typing),
          adminLastSeen: data.admin?.lastSeen || null,
        });
      }
    } catch {
      // ignore
    }
  }, [canShow]);

  const pingPresence = useCallback(
    async (typing?: boolean) => {
      if (!canShow || !csrfToken) return;
      try {
        await fetch("/api/support/presence", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({ typing }),
        });
      } catch {
        // ignore
      }
    },
    [canShow, csrfToken]
  );

  useEffect(() => {
    if (!isOpen) return;
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [isOpen, fetchMessages]);

  useEffect(() => {
    if (isOpen) return;
    setAttachments([]);
    setMessageInput("");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    fetchPresence();
    pingPresence();
    const interval = setInterval(() => {
      fetchPresence();
      pingPresence();
    }, 15000);
    return () => clearInterval(interval);
  }, [isOpen, fetchPresence, pingPresence]);

  useEffect(() => {
    if (!isOpen) return;
    if (!messageInput.trim()) {
      pingPresence(false);
      return;
    }
    pingPresence(true);
    const timeout = setTimeout(() => {
      pingPresence(false);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [messageInput, isOpen, pingPresence]);

  const uploadAttachments = async () => {
    if (!csrfToken || attachments.length === 0) return [];
    setIsUploading(true);
    try {
      const formData = new FormData();
      attachments.forEach((file) => formData.append("files", file));
      const res = await fetch("/api/support/upload", {
        method: "POST",
        credentials: "include",
        headers: {
          "x-csrf-token": csrfToken,
        },
        body: formData,
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || "Upload failed");
      }
      return data.uploads || [];
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!csrfToken) return;
    if (!messageInput.trim() && attachments.length === 0) return;
    setIsSending(true);
    try {
      const uploaded = attachments.length > 0 ? await uploadAttachments() : [];
      const res = await fetch("/api/support/messages", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ message: messageInput.trim(), attachments: uploaded }),
      });
      const data = await res.json();
      if (data.success) {
        setMessageInput("");
        setAttachments([]);
        fetchMessages();
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingId || !editingText.trim() || !csrfToken) return;
    setIsSending(true);
    try {
      const res = await fetch("/api/support/messages", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ messageId: editingId, message: editingText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingId(null);
        setEditingText("");
        fetchMessages();
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!csrfToken) return;
    setIsSending(true);
    try {
      const res = await fetch("/api/support/messages", {
        method: "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ messageId }),
      });
      const data = await res.json();
      if (data.success) {
        setDeleteConfirmId(null);
        fetchMessages();
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleAttachmentSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const valid = files.filter(
      (file) =>
        ["image/jpeg", "image/png", "application/pdf"].includes(file.type) &&
        file.size <= 10 * 1024 * 1024
    );
    setAttachments((prev) => [...prev, ...valid].slice(0, 5));
    event.target.value = "";
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const lastAdminMessage = useMemo(() => {
    const latest = [...messages].reverse().find((m) => m.senderRole === "admin");
    if (!latest) return "";
    return latest.message || (latest.attachments && latest.attachments.length > 0 ? "Attachment sent" : "");
  }, [messages]);

  if (!canShow) return null;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 left-4 sm:left-auto sm:w-[360px] z-50"
          >
            <div className="glass-panel rounded-3xl overflow-hidden border border-white/60 shadow-[0_40px_120px_-50px_rgba(15,23,42,0.75)] ring-1 ring-slate-900/10">
              <div className="px-5 py-4 bg-gradient-to-r from-primary to-primary-hover text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em]">Support</p>
                    <p className="text-sm font-semibold">Live desk</p>
                    <p className="text-[10px] text-white/80">
                      {presence.adminOnline
                        ? "Support online"
                        : presence.adminLastSeen
                          ? `Last seen ${formatTime(presence.adminLastSeen)}`
                          : "Support away"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
                  aria-label="Close support"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-5 py-4 max-h-[45vh] overflow-y-auto space-y-3">
                {isLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="surface-card rounded-2xl p-4 h-14 animate-pulse" />
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-10 space-y-2">
                    <p>Tell us what you need and we will reply shortly.</p>
                    {presence.adminTyping && <p className="italic">Support is typing...</p>}
                  </div>
                ) : (
                  <>
                    {messages.map((message) => {
                      const isOwnerMessage = message.senderRole === "propertyOwner";
                      const isEditing = editingId === message._id;
                      return (
                        <div
                          key={message._id}
                          className={`flex ${isOwnerMessage ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[78%] rounded-2xl px-4 py-3 text-xs shadow-sm ${
                              isOwnerMessage
                                ? "bg-primary text-white"
                                : "bg-white/80 text-foreground border border-border"
                            }`}
                          >
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  rows={2}
                                  className="w-full resize-none rounded-xl bg-white/15 px-3 py-2 text-xs text-white placeholder:text-white/70 focus:outline-none"
                                />
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => {
                                      setEditingId(null);
                                      setEditingText("");
                                    }}
                                    className="text-[10px] text-white/80 hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={handleEditSave}
                                    disabled={isSending}
                                    className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-white/30"
                                  >
                                    <Check className="h-3 w-3" />
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {message.message && <p className="whitespace-pre-wrap">{message.message}</p>}
                                {message.attachments && message.attachments.length > 0 && (
                                  <div className="mt-3 grid grid-cols-1 gap-2">
                                    {message.attachments.map((attachment) => {
                                      const isImage = attachment.type.startsWith("image/");
                                      return (
                                        <a
                                          key={attachment.url}
                                          href={attachment.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className={`flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2 text-[10px] ${
                                            isOwnerMessage ? "text-white" : "text-foreground"
                                          }`}
                                        >
                                          {isImage ? (
                                            <img
                                              src={attachment.url}
                                              alt={attachment.name}
                                              className="h-12 w-16 rounded-lg object-cover"
                                            />
                                          ) : (
                                            <div className="h-12 w-16 rounded-lg bg-white/20 flex items-center justify-center">
                                              <FileText className="h-5 w-5" />
                                            </div>
                                          )}
                                          <div className="flex-1">
                                            <p className="font-medium truncate">{attachment.name}</p>
                                            <p className="text-[9px] opacity-70">
                                              {Math.round(attachment.size / 1024)} KB
                                            </p>
                                          </div>
                                        </a>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className={`mt-2 flex items-center justify-between text-[10px] ${isOwnerMessage ? "text-white/80" : "text-muted-foreground"}`}>
                                  <span>
                                    {formatTime(message.createdAt)}
                                    {message.updatedAt ? " · edited" : ""}
                                  </span>
                                  {isOwnerMessage && (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => {
                                          setEditingId(message._id);
                                          setEditingText(message.message);
                                        }}
                                        className="hover:text-white"
                                        title="Edit message"
                                      >
                                        <PencilLine className="h-3 w-3" />
                                      </button>
                                      {deleteConfirmId === message._id ? (
                                        <button
                                          onClick={() => handleDelete(message._id)}
                                          className="hover:text-white"
                                          title="Confirm delete"
                                        >
                                          <Check className="h-3 w-3" />
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => setDeleteConfirmId(message._id)}
                                          className="hover:text-white"
                                          title="Delete message"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {presence.adminTyping && (
                      <div className="text-xs text-muted-foreground italic">Support is typing...</div>
                    )}
                  </>
                )}
              </div>

              {lastAdminMessage && (
                <div className="px-5 py-2 border-t border-border bg-white/60 text-[10px] text-muted-foreground">
                  Latest reply: {lastAdminMessage.slice(0, 60)}
                  {lastAdminMessage.length > 60 ? "…" : ""}
                </div>
              )}

              <div className="px-5 py-4 border-t border-border bg-white/70">
                {attachments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {attachmentPreviews.map((item, index) => (
                      <div
                        key={`${item.file.name}-${index}`}
                        className="flex items-center gap-2 rounded-2xl border border-border bg-white/70 px-3 py-2 text-[10px]"
                      >
                        {item.preview ? (
                          <img src={item.preview} alt={item.file.name} className="h-10 w-12 rounded-lg object-cover" />
                        ) : (
                          <div className="h-10 w-12 rounded-lg bg-white/60 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span className="max-w-[140px] truncate text-muted-foreground">{item.file.name}</span>
                        <button
                          onClick={() => handleRemoveAttachment(index)}
                          className="text-muted-foreground hover:text-foreground"
                          title="Remove attachment"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-end gap-3">
                  <label className="h-11 w-11 rounded-2xl border border-border bg-white/70 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,application/pdf"
                      className="hidden"
                      onChange={handleAttachmentSelect}
                      disabled={isSending || isUploading}
                    />
                    <Paperclip className="h-4 w-4" />
                  </label>
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Write a message..."
                    rows={2}
                    className="flex-1 resize-none rounded-2xl border border-border bg-white/70 px-4 py-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    disabled={isSending || isUploading}
                  />
                  <button
                    onClick={handleSend}
                    disabled={isSending || isUploading || (!messageInput.trim() && attachments.length === 0)}
                    className="h-11 w-11 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary-hover transition disabled:opacity-60"
                    title="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  We typically respond within a few minutes during business hours.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-6 right-6 z-40">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setIsOpen((open) => !open)}
          className="relative h-14 w-14 rounded-full bg-slate-900 text-white shadow-[0_20px_45px_-18px_rgba(15,23,42,0.75)] ring-2 ring-white/80 flex items-center justify-center transition hover:bg-slate-800"
          aria-label="Open live support"
        >
          <span className="absolute -inset-1 rounded-full bg-slate-900/30 blur-xl" />
          <MessageCircle className="h-6 w-6 relative" />
        </motion.button>
      </div>
    </>
  );
}
