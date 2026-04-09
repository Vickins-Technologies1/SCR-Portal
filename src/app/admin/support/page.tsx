"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCheck,
  FileText,
  Headphones,
  MessageCircle,
  Paperclip,
  PencilLine,
  Reply,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import { withCsrfRetry } from "@/lib/csrf-client";

interface Conversation {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  unreadCount: number;
  assignedAdminId?: string | null;
  assignedAdminName?: string | null;
  labels?: string[];
  lastMessage: {
    message: string;
    senderRole: "propertyOwner" | "admin";
    createdAt: string;
  };
}

interface AttachmentMeta {
  url: string;
  name: string;
  type: string;
  size: number;
}

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
  attachments?: AttachmentMeta[];
  seenByAdmin?: boolean;
  seenByOwner?: boolean;
}

interface AdminUser {
  _id: string;
  name: string;
  email: string;
}

export default function AdminSupportPage() {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [status, setStatus] = useState<"checking" | "authenticated" | "unauthenticated">("checking");
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [assignedAdminId, setAssignedAdminId] = useState<string | null>(null);
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [search, setSearch] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [replyTo, setReplyTo] = useState<SupportMessage["replyTo"] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUpdatingTicket, setIsUpdatingTicket] = useState(false);
  const hasLoadedConversations = useRef(false);
  const hasLoadedMessages = useRef(false);
  const previousOwnerId = useRef<string | null>(null);
  const [presence, setPresence] = useState({
    ownerOnline: false,
    ownerTyping: false,
    ownerLastSeen: null as string | null,
  });

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Session invalid");
      const data = await res.json();
      if (!data.authenticated) throw new Error("Not authenticated");

      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      router.replace("/admin/login?session=expired");
    }
  }, [router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

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

  const loadCsrfToken = useCallback(async () => {
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
    return loadCsrfToken();
  }, [csrfToken, loadCsrfToken]);

  const refreshCsrfToken = useCallback(async () => loadCsrfToken(), [loadCsrfToken]);

  useEffect(() => {
    if (status === "authenticated") {
      loadCsrfToken();
    }
  }, [status, loadCsrfToken]);

  const fetchAdmins = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/admin", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setAdmins(data.admins || []);
      }
    } catch {
      // ignore
    }
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchAdmins();
    }
  }, [status, fetchAdmins]);

  const fetchConversations = useCallback(async () => {
    if (status !== "authenticated") return;
    const wasInitialLoad = !hasLoadedConversations.current;
    if (wasInitialLoad) {
      setIsLoadingConversations(true);
    }
    try {
      const res = await fetch("/api/support/conversations", { credentials: "include", cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login?session=expired");
        return;
      }
      const data = await res.json();
      if (data.success) {
        const nextConversations = data.conversations || [];
        setConversations((prev) => {
          if (prev.length !== nextConversations.length) return nextConversations;
          for (let i = 0; i < prev.length; i += 1) {
            const prevConv = prev[i];
            const nextConv = nextConversations[i];
            if (
              prevConv.ownerId !== nextConv.ownerId ||
              prevConv.unreadCount !== nextConv.unreadCount ||
              prevConv.assignedAdminId !== nextConv.assignedAdminId ||
              prevConv.assignedAdminName !== nextConv.assignedAdminName ||
              prevConv.lastMessage.createdAt !== nextConv.lastMessage.createdAt ||
              prevConv.lastMessage.message !== nextConv.lastMessage.message
            ) {
              return nextConversations;
            }
            const prevLabels = prevConv.labels || [];
            const nextLabels = nextConv.labels || [];
            if (prevLabels.length !== nextLabels.length) return nextConversations;
            for (let j = 0; j < prevLabels.length; j += 1) {
              if (prevLabels[j] !== nextLabels[j]) return nextConversations;
            }
          }
          return prev;
        });
        hasLoadedConversations.current = true;
      }
    } finally {
      if (wasInitialLoad) {
        setIsLoadingConversations(false);
      }
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchConversations();
      const interval = setInterval(fetchConversations, 8000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [status, fetchConversations]);

  const fetchMessages = useCallback(
    async (ownerId: string) => {
      if (!ownerId) return;
      const wasInitialLoad = !hasLoadedMessages.current;
      if (wasInitialLoad) {
        setIsLoadingMessages(true);
      }
      try {
        const res = await fetch(`/api/support/messages?ownerId=${ownerId}`, {
          credentials: "include",
          cache: "no-store",
        });
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
          setIsLoadingMessages(false);
        }
      }
    },
    []
  );

  const fetchPresence = useCallback(
    async (ownerId: string) => {
      if (!ownerId) return;
      try {
        const res = await fetch(`/api/support/presence?ownerId=${ownerId}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (data.success) {
          setPresence({
            ownerOnline: Boolean(data.owner?.online),
            ownerTyping: Boolean(data.owner?.typing),
            ownerLastSeen: data.owner?.lastSeen || null,
          });
        }
      } catch {
        // ignore
      }
    },
    []
  );

  const pingPresence = useCallback(
    async (ownerId: string, typing?: boolean) => {
      if (!ownerId) return;
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
            body: JSON.stringify({ ownerId, typing }),
          }),
          refreshCsrfToken
        );
      } catch {
        // ignore
      }
    },
    [ensureCsrfToken, refreshCsrfToken]
  );

  const updateTicket = useCallback(
    async (ownerId: string, nextAssignedAdminId: string | null, nextLabels: string[]) => {
      const token = await ensureCsrfToken();
      if (!token) return;
      setIsUpdatingTicket(true);
      try {
        const res = await withCsrfRetry(token, (activeToken) =>
          fetch("/api/support/conversations", {
            method: "PATCH",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "x-csrf-token": activeToken,
            },
            body: JSON.stringify({
              ownerId,
              assignedAdminId: nextAssignedAdminId,
              labels: nextLabels,
            }),
          }),
          refreshCsrfToken
        );
        const data = await res.json();
        if (data.success) {
          fetchConversations();
        }
      } finally {
        setIsUpdatingTicket(false);
      }
    },
    [ensureCsrfToken, refreshCsrfToken, fetchConversations]
  );

  useEffect(() => {
    if (!selectedOwnerId) return;
    hasLoadedMessages.current = false;
    setIsLoadingMessages(false);
    fetchMessages(selectedOwnerId);
    const interval = setInterval(() => fetchMessages(selectedOwnerId), 5000);
    return () => clearInterval(interval);
  }, [selectedOwnerId, fetchMessages]);

  useEffect(() => {
    if (!selectedOwnerId) return;
    fetchPresence(selectedOwnerId);
    pingPresence(selectedOwnerId);
    const interval = setInterval(() => {
      fetchPresence(selectedOwnerId);
      pingPresence(selectedOwnerId);
    }, 15000);
    return () => clearInterval(interval);
  }, [selectedOwnerId, fetchPresence, pingPresence]);

  useEffect(() => {
    if (!selectedOwnerId) return;
    if (!messageInput.trim()) {
      pingPresence(selectedOwnerId, false);
      return;
    }
    pingPresence(selectedOwnerId, true);
    const timeout = setTimeout(() => {
      pingPresence(selectedOwnerId, false);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [messageInput, selectedOwnerId, pingPresence]);

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.ownerId === selectedOwnerId) || null,
    [conversations, selectedOwnerId]
  );

  const areLabelsEqual = useCallback((left: string[], right: string[]) => {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }, []);

  useEffect(() => {
    if (selectedOwnerId === previousOwnerId.current) return;
    previousOwnerId.current = selectedOwnerId;
    if (selectedConversation) {
      setAssignedAdminId(selectedConversation.assignedAdminId || null);
      setLabels(selectedConversation.labels || []);
      setLabelInput("");
      setMessageInput("");
      setReplyTo(null);
      setEditingId(null);
      setEditingText("");
      setDeleteConfirmId(null);
      setAttachments([]);
    } else {
      setAssignedAdminId(null);
      setLabels([]);
      setLabelInput("");
      setMessageInput("");
      setReplyTo(null);
      setEditingId(null);
      setEditingText("");
      setDeleteConfirmId(null);
      setAttachments([]);
      setPresence({
        ownerOnline: false,
        ownerTyping: false,
        ownerLastSeen: null,
      });
    }
  }, [selectedOwnerId, selectedConversation]);

  useEffect(() => {
    if (!selectedConversation) return;
    const nextAssigned = selectedConversation.assignedAdminId || null;
    setAssignedAdminId((prev) => (prev === nextAssigned ? prev : nextAssigned));
    const nextLabels = selectedConversation.labels || [];
    setLabels((prev) => (areLabelsEqual(prev, nextLabels) ? prev : nextLabels));
  }, [selectedConversation, areLabelsEqual]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) =>
      `${c.ownerName} ${c.ownerEmail}`.toLowerCase().includes(term)
    );
  }, [conversations, search]);

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
      return data.uploads as AttachmentMeta[];
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!selectedOwnerId) return;
    if (!messageInput.trim() && attachments.length === 0) return;
    const token = await ensureCsrfToken();
    if (!token) {
      setSendError("Unable to verify your session. Please refresh and try again.");
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
            ownerId: selectedOwnerId,
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
        setSendError(null);
        fetchMessages(selectedOwnerId);
        fetchConversations();
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleAssign = async (value: string) => {
    if (!selectedOwnerId) return;
    const next = value || null;
    setAssignedAdminId(next);
    await updateTicket(selectedOwnerId, next, labels);
  };

  const handleAddLabel = async () => {
    if (!selectedOwnerId) return;
    const trimmed = labelInput.trim();
    if (!trimmed) return;
    if (labels.includes(trimmed)) {
      setLabelInput("");
      return;
    }
    const nextLabels = [...labels, trimmed].slice(0, 6);
    setLabels(nextLabels);
    setLabelInput("");
    await updateTicket(selectedOwnerId, assignedAdminId, nextLabels);
  };

  const handleRemoveLabel = async (label: string) => {
    if (!selectedOwnerId) return;
    const nextLabels = labels.filter((item) => item !== label);
    setLabels(nextLabels);
    await updateTicket(selectedOwnerId, assignedAdminId, nextLabels);
  };

  const handleEditSave = async () => {
    if (!editingId || !editingText.trim()) return;
    const token = await ensureCsrfToken();
    if (!token) {
      setSendError("Unable to verify your session. Please refresh and try again.");
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
      if (data.success && selectedOwnerId) {
        setEditingId(null);
        setEditingText("");
        setSendError(null);
        fetchMessages(selectedOwnerId);
        fetchConversations();
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to update message");
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async (messageId: string) => {
    const token = await ensureCsrfToken();
    if (!token) {
      setSendError("Unable to verify your session. Please refresh and try again.");
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
      if (data.success && selectedOwnerId) {
        setDeleteConfirmId(null);
        setSendError(null);
        fetchMessages(selectedOwnerId);
        fetchConversations();
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to delete message");
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
    const merged = [...attachments, ...valid].slice(0, 5);
    setAttachments(merged);
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

  if (status === "checking") {
    return (
      <div className="min-h-[100svh] bg-transparent text-foreground">
        <Navbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} />
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
          <main className="max-w-7xl mx-auto space-y-6">
            <section className="glass-panel rounded-3xl p-6 sm:p-8 animate-pulse">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-primary/10" />
                  <div className="space-y-2">
                    <div className="h-3 w-24 rounded-full bg-muted/40" />
                    <div className="h-5 w-48 rounded-full bg-muted/30" />
                    <div className="h-3 w-56 rounded-full bg-muted/30" />
                  </div>
                </div>
                <div className="h-3 w-40 rounded-full bg-muted/30" />
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:gap-6 lg:min-h-[520px] lg:h-[calc(100svh-260px)] lg:max-h-[calc(100svh-260px)]">
              <div className="surface-card rounded-3xl p-4 sm:p-5 flex flex-col lg:h-full lg:overflow-hidden animate-pulse">
                <div className="h-10 rounded-2xl border border-border bg-white/70" />
                <div className="mt-4 space-y-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="surface-card rounded-2xl p-4 h-20" />
                  ))}
                </div>
              </div>

              <div className="surface-card rounded-3xl flex flex-col min-h-[520px] lg:min-h-0 lg:h-full lg:overflow-hidden animate-pulse">
                <div className="border-b border-border px-5 py-4">
                  <div className="h-4 w-40 rounded-full bg-muted/30" />
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="surface-card rounded-2xl p-4 h-20" />
                  ))}
                </div>
                <div className="border-t border-border px-5 py-4">
                  <div className="h-10 rounded-2xl bg-white/70 border border-border" />
                  <div className="mt-3 h-8 w-32 rounded-xl bg-primary/20" />
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Headphones className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Admin Console</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Live Support</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Respond to owner requests and keep conversations moving.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Live updates every few seconds
              </div>
            </div>
          </motion.section>

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:gap-6 lg:min-h-[520px] lg:h-[calc(100svh-260px)] lg:max-h-[calc(100svh-260px)]">
            <div className="surface-card rounded-3xl p-4 sm:p-5 flex flex-col lg:h-full lg:overflow-hidden">
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-white/70 px-3 py-2 text-xs text-muted-foreground">
                <Search className="h-4 w-4" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search owners..."
                  className="w-full bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="mt-4 space-y-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                {isLoadingConversations ? (
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
                  filteredConversations.map((conversation) => {
                    const isActive = conversation.ownerId === selectedOwnerId;
                    return (
                      <button
                        key={conversation.ownerId}
                        onClick={() => setSelectedOwnerId(conversation.ownerId)}
                        className={`w-full text-left rounded-2xl p-4 transition-all border ${
                          isActive
                            ? "border-primary/40 bg-primary/10 shadow-sm"
                            : "border-transparent hover:bg-primary/5"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{conversation.ownerName}</p>
                            <p className="text-[10px] text-muted-foreground">{conversation.ownerEmail}</p>
                          </div>
                          {conversation.unreadCount > 0 && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              {conversation.unreadCount}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                          {conversation.lastMessage.message || "Attachment sent"}
                        </p>
                        {conversation.labels && conversation.labels.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {conversation.labels.slice(0, 3).map((label) => (
                              <span
                                key={label}
                                className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                        {conversation.assignedAdminName && (
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            Assigned: {conversation.assignedAdminName}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {new Date(conversation.lastMessage.createdAt).toLocaleDateString("en-US", {
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
                    <p className="text-sm font-semibold text-foreground">
                      {selectedConversation ? selectedConversation.ownerName : "Select a conversation"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedConversation ? selectedConversation.ownerEmail : "Owner support inbox"}
                    </p>
                  </div>
                </div>
                {selectedConversation && (
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span
                      className={`inline-flex h-2.5 w-2.5 rounded-full ${
                        presence.ownerOnline ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                    />
                    <span>
                      {presence.ownerOnline
                        ? "Owner online"
                        : presence.ownerLastSeen
                          ? `Last seen ${formatTime(presence.ownerLastSeen)}`
                          : "Owner away"}
                    </span>
                    <span className="inline-flex items-center gap-1 uppercase tracking-[0.3em]">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Live
                    </span>
                  </div>
                )}
              </div>

              {selectedConversation && (
                <div className="border-b border-border px-5 py-3 bg-white/60">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.3em]">Assignee</span>
                      <select
                        value={assignedAdminId || ""}
                        onChange={(e) => handleAssign(e.target.value)}
                        disabled={isUpdatingTicket}
                        className="rounded-full border border-border bg-white/80 px-3 py-1 text-xs text-foreground focus:outline-none"
                      >
                        <option value="">Unassigned</option>
                        {admins.map((admin) => (
                          <option key={admin._id} value={admin._id}>
                            {admin.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.3em]">Labels</span>
                      <div className="flex flex-wrap gap-2">
                        {labels.map((label) => (
                          <span
                            key={label}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                          >
                            {label}
                            <button
                              onClick={() => handleRemoveLabel(label)}
                              className="text-primary/70 hover:text-primary"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          value={labelInput}
                          onChange={(e) => setLabelInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddLabel();
                            }
                          }}
                          placeholder="Add label"
                          className="rounded-full border border-border bg-white/80 px-3 py-1 text-xs text-foreground focus:outline-none"
                        />
                        <button
                          onClick={handleAddLabel}
                          disabled={!labelInput.trim() || isUpdatingTicket}
                          className="rounded-full bg-primary/15 px-3 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                {selectedOwnerId ? (
                  isLoadingMessages ? (
                    <div className="space-y-3">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="surface-card rounded-2xl p-4 h-16 animate-pulse" />
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground py-16 space-y-2">
                      <p>No messages yet. Start the conversation below.</p>
                      {presence.ownerTyping && <p className="italic">Owner is typing...</p>}
                    </div>
                  ) : (
                    <>
                      {messages.map((message, index) => {
                        const isAdminMessage = message.senderRole === "admin";
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
                            <div className={`flex ${isAdminMessage ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`max-w-[78%] rounded-2xl px-4 py-3 text-xs sm:text-sm shadow-sm ${
                                  isAdminMessage
                                    ? "bg-primary text-white"
                                    : "bg-white/70 text-foreground border border-border"
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
                                          isAdminMessage
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
                                                isAdminMessage ? "text-white" : "text-foreground"
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
                                        isAdminMessage ? "text-white/80" : "text-muted-foreground"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span>
                                          {formatTime(message.createdAt)}
                                          {message.updatedAt ? " · edited" : ""}
                                        </span>
                                        {isAdminMessage && (
                                          <span className="inline-flex items-center">
                                            {message.seenByOwner ? (
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
                                          className={isAdminMessage ? "hover:text-white" : "hover:text-foreground"}
                                          title="Reply to message"
                                        >
                                          <Reply className="h-3 w-3" />
                                        </button>
                                        {isAdminMessage && (
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
                      {presence.ownerTyping && (
                        <div className="text-xs text-muted-foreground italic">Owner is typing...</div>
                      )}
                    </>
                  )
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground gap-3">
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Headphones className="h-6 w-6 text-primary" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">Ready for support</p>
                    <p className="text-xs max-w-xs">
                      Pick a conversation on the left to view messages and reply in real time.
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-border px-5 py-4">
                {replyTo && selectedOwnerId && (
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
                      disabled={!selectedOwnerId || isSending || isUploading}
                    />
                    <Paperclip className="h-4 w-4" />
                  </label>
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder={
                      selectedOwnerId ? "Write a reply..." : "Select a conversation to reply"
                    }
                    rows={2}
                    className="flex-1 resize-none rounded-2xl border border-border bg-white/70 px-4 py-3 text-xs sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    disabled={!selectedOwnerId || isSending || isUploading}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!selectedOwnerId || isSending || isUploading || (!messageInput.trim() && attachments.length === 0)}
                    className="h-11 w-11 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary-hover transition disabled:opacity-60"
                    title="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Tip: Add a label or assign this ticket to keep support organized.
                  </p>
                  {sendError && (
                    <p className="mt-2 text-[10px] text-red-600" role="alert">
                      {sendError}
                    </p>
                  )}
                </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
