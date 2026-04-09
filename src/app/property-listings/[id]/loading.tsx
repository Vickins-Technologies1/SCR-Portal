export default function PropertyDetailLoading() {
  return (
    <main className="relative isolate min-h-screen bg-[#f7f6f3] text-slate-900">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgba(148,163,184,0.22)_1px,transparent_1px)] bg-[length:22px_22px] opacity-40" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(135deg,rgba(255,255,255,0.7),rgba(255,255,255,0))] opacity-60" />

      <div className="max-w-7xl mx-auto px-6 pt-28 pb-16">
        <div className="h-8 w-40 rounded-full bg-slate-200/80 animate-pulse" />

        <section className="mt-8 grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-8">
            <div className="rounded-[32px] border border-white/70 bg-white/85 p-4 sm:p-6 shadow-[0_22px_50px_-40px_rgba(15,23,42,0.45)] backdrop-blur animate-pulse">
              <div className="h-72 w-full rounded-3xl bg-slate-200/70 sm:h-80" />
              <div className="mt-4 flex gap-3">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={`thumb-${idx}`} className="h-16 w-24 rounded-2xl bg-slate-200/70" />
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 sm:p-8 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur animate-pulse">
              <div className="space-y-3">
                <div className="h-3 w-24 rounded-full bg-slate-200/70" />
                <div className="h-6 w-2/3 rounded-full bg-slate-200/80" />
                <div className="h-4 w-1/2 rounded-full bg-slate-200/70" />
              </div>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={`stat-${idx}`}
                    className="rounded-2xl border border-white/70 bg-white/70 p-4 backdrop-blur"
                  >
                    <div className="h-3 w-20 rounded-full bg-slate-200/70" />
                    <div className="mt-2 h-5 w-24 rounded-full bg-slate-200/80" />
                  </div>
                ))}
              </div>
              <div className="mt-6 space-y-2">
                <div className="h-3 w-24 rounded-full bg-slate-200/70" />
                <div className="h-4 w-full rounded-full bg-slate-200/70" />
                <div className="h-4 w-5/6 rounded-full bg-slate-200/70" />
              </div>
            </div>

            <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 sm:p-8 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur animate-pulse">
              <div className="flex items-center justify-between mb-5">
                <div className="h-5 w-32 rounded-full bg-slate-200/80" />
                <div className="h-4 w-20 rounded-full bg-slate-200/70" />
              </div>
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div
                    key={`unit-${idx}`}
                    className="rounded-2xl border border-slate-200 bg-white/70 p-5 sm:p-6"
                  >
                    <div className="h-4 w-40 rounded-full bg-slate-200/80" />
                    <div className="mt-2 h-3 w-24 rounded-full bg-slate-200/70" />
                    <div className="mt-4 flex flex-wrap gap-3">
                      <div className="h-3 w-24 rounded-full bg-slate-200/70" />
                      <div className="h-3 w-20 rounded-full bg-slate-200/70" />
                      <div className="h-3 w-16 rounded-full bg-slate-200/70" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-6 lg:sticky lg:top-24 lg:h-fit">
            <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur animate-pulse">
              <div className="flex items-center justify-between">
                <div className="h-4 w-32 rounded-full bg-slate-200/80" />
                <div className="h-3 w-10 rounded-full bg-slate-200/70" />
              </div>
              <div className="mt-4 rounded-2xl border border-white/70 bg-white/70 p-4">
                <div className="h-3 w-24 rounded-full bg-slate-200/70" />
                <div className="mt-2 h-6 w-32 rounded-full bg-slate-200/80" />
              </div>
              <div className="mt-4 h-8 w-full rounded-full bg-slate-200/80" />
              <div className="mt-4 h-3 w-40 rounded-full bg-slate-200/70" />
            </div>

            <div className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_18px_40px_-35px_rgba(15,23,42,0.45)] backdrop-blur animate-pulse">
              <div className="h-4 w-32 rounded-full bg-slate-200/80" />
              <div className="mt-4 space-y-3">
                <div className="h-3 w-48 rounded-full bg-slate-200/70" />
                <div className="h-3 w-40 rounded-full bg-slate-200/70" />
              </div>
              <div className="mt-6 rounded-2xl border border-white/70 bg-white/70 px-4 py-4">
                <div className="h-3 w-24 rounded-full bg-slate-200/70" />
                <div className="mt-2 h-3 w-48 rounded-full bg-slate-200/70" />
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
