"use client";

import React from "react";

export default function AdminLoading() {
  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <header className="fixed top-0 left-0 right-0 z-40 h-16 w-full border-b border-white/40 bg-white/70 backdrop-blur-xl">
        <div className="flex h-full items-center justify-between px-3 sm:px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-[10px] border border-border bg-white/80" />
            <div className="h-6 w-28 rounded-full bg-muted/30" />
          </div>
          <div className="h-8 w-20 rounded-full bg-muted/30" />
        </div>
      </header>

      <aside className="fixed left-0 top-16 bottom-0 z-30 hidden w-72 border-r border-border bg-card md:block">
        <div className="h-full animate-pulse">
          <div className="border-b border-border px-6 py-6">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10" />
            <div className="mt-4 space-y-2">
              <div className="mx-auto h-3 w-24 rounded-full bg-muted/30" />
              <div className="mx-auto h-4 w-32 rounded-full bg-muted/30" />
            </div>
          </div>
          <div className="px-4 py-5 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-white/70 border border-border" />
            ))}
          </div>
        </div>
      </aside>

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6 animate-pulse">
          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10" />
                <div className="space-y-2">
                  <div className="h-3 w-24 rounded-full bg-muted/30" />
                  <div className="h-5 w-44 rounded-full bg-muted/30" />
                  <div className="h-3 w-56 rounded-full bg-muted/30" />
                </div>
              </div>
              <div className="h-3 w-40 rounded-full bg-muted/30" />
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="surface-card rounded-2xl p-5 sm:p-6 h-32" />
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:gap-6 lg:min-h-[520px] lg:h-[calc(100svh-260px)] lg:max-h-[calc(100svh-260px)]">
            <div className="surface-card rounded-3xl p-4 sm:p-5 flex flex-col lg:h-full lg:overflow-hidden">
              <div className="h-10 rounded-2xl border border-border bg-white/70" />
              <div className="mt-4 space-y-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="surface-card rounded-2xl p-4 h-20" />
                ))}
              </div>
            </div>

            <div className="surface-card rounded-3xl flex flex-col min-h-[520px] lg:min-h-0 lg:h-full lg:overflow-hidden">
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
          </section>
        </main>
      </div>
    </div>
  );
}
