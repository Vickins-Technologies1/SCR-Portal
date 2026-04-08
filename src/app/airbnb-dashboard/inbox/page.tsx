"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbConversation } from "@/types/airbnb";

const templates = [
  { id: "t-1", title: "Welcome message", body: "Karibu! Your check-in is at 2pm. Here is your access code..." },
  { id: "t-2", title: "Check-in instructions", body: "Hi {name}, the key is in the lockbox at the main gate..." },
  { id: "t-3", title: "Review request", body: "We hope you enjoyed your stay! Could you leave a quick review?" },
];

export default function AirbnbInboxPage() {
  const { hasAccess, ownerId } = useAirbnbAccess("notifications:view");
  const [conversations, setConversations] = useState<AirbnbConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
              <button className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold">
                <Sparkles size={16} />
                AI reply
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
                      className="rounded-2xl border border-border bg-white/70 px-4 py-3 flex items-center justify-between gap-4"
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
                <textarea
                  rows={5}
                  className="w-full rounded-2xl border border-border bg-white/80 px-4 py-3 text-xs text-foreground"
                  placeholder="Type a message or select a template..."
                />
                <button className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                  <Send size={14} />
                  Send message
                </button>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.3em] mb-3">
                  Templates
                </p>
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="rounded-2xl border border-border bg-white/70 px-3 py-3 text-[11px] text-muted-foreground"
                    >
                      <p className="font-semibold text-foreground">{template.title}</p>
                      <p className="mt-1 line-clamp-2">{template.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
