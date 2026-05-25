"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCheck,
  Headphones,
  Send,
  X,
  Sparkles,
  PencilLine,
  Trash2,
  Reply,
  Check,
  Paperclip,
  FileText,
} from "lucide-react";
import { motion } from "framer-motion";
import Cookies from "js-cookie";
import { withCsrfRetry } from "@/lib/csrf-client";

interface SupportMessage {
  _id: string;
  ownerId: string;
  senderRole: "propertyOwner" | "admin";
  senderName?: string;
  message: string;
  replyTo?: {
    messageId: string;
    message: string;
    senderRole: "propertyOwner" | "admin";
    senderName?: string;
    createdAt?: string;
  };
  createdAt: string;
  updatedAt?: string;
  attachments?: {
    url: string;
    name: string;
    type: string;
    size: number;
    }[];
  seenByAdmin?: boolean;
  seenByOwner?: boolean;
}

const panelVariants = {
  open: { opacity: 1, y: 0, scale: 1 },
  closed: { opacity: 0, y: 20, scale: 0.98 },
};

export default function SupportWidget() {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("supportWidgetOpen") === "true";
  });
  const [role] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return Cookies.get("role") || null;
  });
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [replyTo, setReplyTo] = useState<SupportMessage["replyTo"] | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedMessages = useRef(false);
  const [presence, setPresence] = useState({
    adminOnline: false,
    adminTyping: false,
    adminLastSeen: null as string | null,
  });

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem("supportWidgetOpen", isOpen ? "true" : "false");
  }, [isOpen]);

  const fetchCsrfToken = useCallback(async () => {
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data = await res.json();
      if (data.success && data.csrfToken) {
        setCsrfToken(data.csrfToken);
        return data.csrfToken as string;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const ensureCsrfToken = useCallback(async () => {
    if (csrfToken) return csrfToken;
    return fetchCsrfToken();
  }, [csrfToken, fetchCsrfToken]);

  const refreshCsrfToken = useCallback(async () => {
    return fetchCsrfToken();
  }, [fetchCsrfToken]);

  useEffect(() => {
    if (canShow) {
      fetchCsrfToken();
    }
  }, [canShow, fetchCsrfToken]);

  const fetchMessages = useCallback(async () => {
    if (!canShow) return;
    const wasInitialLoad = !hasLoadedMessages.current;
    if (wasInitialLoad) {
      setIsLoading(true);
    }
    try {
      const res = await fetch("/api/support/messages", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        const nextMessages = data.messages || [];
        setMessages((prev) => {
          if (prev.length !== nextMessages.length) return nextMessages;
          for (let i = 0; i < prev.length; i += 1) {
            const prevMessage = prev[i];
            const nextMessage = nextMessages[i];
            const prevReply = prevMessage.replyTo;
            const nextReply = nextMessage.replyTo;
            if (
              prevMessage._id !== nextMessage._id ||
              prevMessage.updatedAt !== nextMessage.updatedAt ||
              prevMessage.createdAt !== nextMessage.createdAt ||
              prevMessage.message !== nextMessage.message ||
              prevMessage.seenByAdmin !== nextMessage.seenByAdmin ||
              prevMessage.seenByOwner !== nextMessage.seenByOwner ||
              (prevMessage.attachments?.length || 0) !== (nextMessage.attachments?.length || 0) ||
              (prevReply?.messageId || "") !== (nextReply?.messageId || "") ||
              (prevReply?.message || "") !== (nextReply?.message || "") ||
              (prevReply?.senderRole || "") !== (nextReply?.senderRole || "")
            ) {
              return nextMessages;
            }
          }
          return prev;
        });
        hasLoadedMessages.current = true;
      }
    } finally {
      if (wasInitialLoad) {
        setIsLoading(false);
      }
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
      if (!canShow) return;
      const token = await ensureCsrfToken();
      if (!token) return;
      try {
        await withCsrfRetry(token, (activeToken) =>
          fetch("/api/support/presence", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": activeToken,
            },
            body: JSON.stringify({ typing }),
          }),
          refreshCsrfToken
        );
      } catch {
        // ignore
      }
    },
    [canShow, ensureCsrfToken, refreshCsrfToken]
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
    setReplyTo(null);
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

  const uploadAttachments = async (token: string) => {
    if (attachments.length === 0) return [];
    setIsUploading(true);
    try {
      const formData = new FormData();
      attachments.forEach((file) => formData.append("files", file));
      const attemptUpload = async (activeToken: string) =>
        fetch("/api/support/upload", {
          method: "POST",
          credentials: "include",
          headers: {
            "x-csrf-token": activeToken,
          },
          body: formData,
        });

      let res = await attemptUpload(token);
      if (res.status === 403) {
        const refreshed = await refreshCsrfToken();
        if (refreshed) {
          res = await attemptUpload(refreshed);
        }
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Upload failed");
      }
      return data.uploads || [];
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!messageInput.trim() && attachments.length === 0) return;
    const token = await ensureCsrfToken();
    if (!token) {
      setError("Unable to verify your session. Please refresh and try again.");
      return;
    }
    setIsSending(true);
    try {
      const uploaded = attachments.length > 0 ? await uploadAttachments(token) : [];
      const res = await withCsrfRetry(
        token,
        (activeToken) =>
        fetch("/api/support/messages", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": activeToken,
          },
          body: JSON.stringify({
            message: messageInput.trim(),
            attachments: uploaded,
            replyTo: replyTo ?? undefined,
          }),
        }),
        refreshCsrfToken
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to send message");
      }
      if (data.success) {
        setMessageInput("");
        setAttachments([]);
        setReplyTo(null);
        setError(null);
        fetchMessages();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleEditSave = async () => {
    if (!editingId || !editingText.trim()) return;
    const token = await ensureCsrfToken();
    if (!token) {
      setError("Unable to verify your session. Please refresh and try again.");
      return;
    }
    setIsSending(true);
    try {
      const res = await withCsrfRetry(
        token,
        (activeToken) =>
        fetch("/api/support/messages", {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": activeToken,
          },
          body: JSON.stringify({ messageId: editingId, message: editingText.trim() }),
        }),
        refreshCsrfToken
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update message");
      }
      if (data.success) {
        setEditingId(null);
        setEditingText("");
        setError(null);
        fetchMessages();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update message");
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    const token = await ensureCsrfToken();
    if (!token) {
      setError("Unable to verify your session. Please refresh and try again.");
      return;
    }
    setIsSending(true);
    try {
      const res = await withCsrfRetry(
        token,
        (activeToken) =>
        fetch("/api/support/messages", {
          method: "DELETE",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": activeToken,
          },
          body: JSON.stringify({ messageId }),
        }),
        refreshCsrfToken
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to delete message");
      }
      if (data.success) {
        setDeleteConfirmId(null);
        setError(null);
        fetchMessages();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete message");
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
  const isSameCalendarDay = (leftDate: Date, rightDate: Date) => {
    return (
      leftDate.getFullYear() === rightDate.getFullYear() &&
      leftDate.getMonth() === rightDate.getMonth() &&
      leftDate.getDate() === rightDate.getDate()
    );
  };
  const formatDayLabel = (value: string) => {
    const messageDate = new Date(value);
    const now = new Date();
    if (isSameCalendarDay(messageDate, now)) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameCalendarDay(messageDate, yesterday)) return "Yesterday";
    return messageDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const selectReplyTarget = useCallback((message: SupportMessage) => {
    let preview = message.message?.trim() || "";
    if (!preview && message.attachments && message.attachments.length > 0) {
      const names = message.attachments
        .map((attachment) => attachment.name)
        .filter(Boolean);
      if (names.length > 0) {
        const maxNames = 2;
        const head = names.slice(0, maxNames).join(", ");
        const suffix = names.length > maxNames ? ` +${names.length - maxNames} more` : "";
        preview = `${names.length > 1 ? "Attachments" : "Attachment"}: ${head}${suffix}`;
      }
    }
    if (!preview) return;
    setReplyTo({
      messageId: message._id,
      message: preview,
      senderRole: message.senderRole,
      senderName: message.senderName,
      createdAt: message.createdAt,
    });
  }, []);

  if (!canShow) return null;

  return (
    <>
      <motion.div
        variants={panelVariants}
        initial={false}
        animate={isOpen ? "open" : "closed"}
        transition={{ duration: 0.2 }}
        className={`fixed bottom-24 right-6 left-4 sm:left-auto sm:w-[360px] z-50 ${
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!isOpen}
      >
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/60 shadow-[0_40px_120px_-50px_rgba(15,23,42,0.75)] ring-1 ring-slate-900/10">
              <div className="px-5 py-4 bg-foreground text-white flex items-center justify-between">
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
                    {messages.map((message, index) => {
                      const isOwnerMessage = message.senderRole === "propertyOwner";
                      const isEditing = editingId === message._id;
                      const previous = index > 0 ? messages[index - 1] : null;
                      const showDate =
                        !previous ||
                        !isSameCalendarDay(new Date(previous.createdAt), new Date(message.createdAt));
                      return (
                        <React.Fragment key={message._id}>
                          {showDate && (
                            <div className="flex justify-center">
                              <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-semibold text-muted-foreground">
                                {formatDayLabel(message.createdAt)}
                              </span>
                            </div>
                          )}
                          <div className={`flex ${isOwnerMessage ? "justify-end" : "justify-start"}`}>
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
                                      className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-white/30 disabled:opacity-60"
                                    >
                                      <Check className="h-3 w-3" />
                                      Save
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {message.replyTo && (
                                    <div
                                      className={`mb-2 rounded-xl border-l-2 px-3 py-2 text-[10px] ${
                                        isOwnerMessage
                                          ? "border-white/50 bg-white/10 text-white/80"
                                          : "border-primary/30 bg-primary/5 text-muted-foreground"
                                      }`}
                                    >
                                      <p className="text-[9px] uppercase tracking-[0.2em]">
                                        {message.replyTo.senderName ||
                                          (message.replyTo.senderRole === "admin" ? "Support" : "Owner")}
                                      </p>
                                      <p className="text-[11px] sm:text-xs line-clamp-2 break-words">
                                        {message.replyTo.message}
                                      </p>
                                    </div>
                                  )}
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
                                  <div
                                    className={`mt-2 flex items-center justify-between text-[10px] ${
                                      isOwnerMessage ? "text-white/80" : "text-muted-foreground"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span>
                                        {formatTime(message.createdAt)}
                                        {message.updatedAt ? " · edited" : ""}
                                      </span>
                                      {isOwnerMessage && (
                                        <span className="inline-flex items-center">
                                          {message.seenByAdmin ? (
                                            <CheckCheck className="h-3 w-3 text-sky-300" />
                                          ) : (
                                            <Check className="h-3 w-3 text-white/70" />
                                          )}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => selectReplyTarget(message)}
                                        className={isOwnerMessage ? "hover:text-white" : "hover:text-foreground"}
                                        title="Reply to message"
                                      >
                                        <Reply className="h-3 w-3" />
                                      </button>
                                      {isOwnerMessage && (
                                        <>
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
                                              disabled={isSending}
                                              className="hover:text-white disabled:opacity-60"
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
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                    {presence.adminTyping && (
                      <div className="text-xs text-muted-foreground italic">Support is typing...</div>
                    )}
                  </>
                )}
              </div>

              <div className="px-5 py-4 border-t border-border bg-white/70">
                {replyTo && (
                  <div className="mb-3 flex items-start justify-between gap-3 rounded-2xl border border-border bg-white/70 px-3 py-2 text-[10px] text-muted-foreground">
                    <div className="space-y-1">
                      <p className="text-[9px] uppercase tracking-[0.2em]">
                        Replying to {replyTo.senderName || (replyTo.senderRole === "admin" ? "Support" : "Owner")}
                      </p>
                      <p className="text-[11px] sm:text-xs text-foreground line-clamp-2 break-words">
                        {replyTo.message}
                      </p>
                    </div>
                    <button
                      onClick={() => setReplyTo(null)}
                      className="text-muted-foreground hover:text-foreground"
                      title="Cancel reply"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
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
                {error && (
                  <p className="mt-2 text-[10px] text-red-600" role="alert">
                    {error}
                  </p>
                )}
              </div>
        </div>
      </motion.div>

      <div className="fixed bottom-24 right-6 z-40 md:bottom-6">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setIsOpen((open) => !open)}
          className="relative h-14 w-14 rounded-full bg-foreground text-white shadow-[0_20px_45px_-18px_rgba(15,23,42,0.75)] ring-2 ring-white/80 flex items-center justify-center transition hover:bg-foreground/90"
          aria-label="Open live support"
        >
          <span className="absolute -inset-1 rounded-full bg-foreground/35 blur-xl" />
          <Headphones className="h-6 w-6 relative" />
        </motion.button>
      </div>
    </>
  );
}
