export default function PropertyListingsLoading() {
  return (
    <main className="relative isolate min-h-screen bg-background text-foreground">

      <section className="relative overflow-hidden pt-28 pb-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_60%)]" />
        <div className="absolute -right-24 top-12 h-56 w-56 rounded-full bg-emerald-200/35 blur-[110px]" />
        <div className="absolute -left-24 bottom-6 h-56 w-56 rounded-full bg-amber-200/35 blur-[110px]" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-2xl space-y-4 animate-pulse">
            <div className="h-3 w-36 rounded-full bg-slate-200/80" />
            <div className="h-8 w-3/4 rounded-full bg-slate-200/80" />
            <div className="h-4 w-5/6 rounded-full bg-slate-200/70" />
            <div className="flex flex-wrap gap-3">
              <div className="h-8 w-36 rounded-full bg-slate-200/80" />
              <div className="h-8 w-40 rounded-full bg-slate-200/70" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={`hero-skel-${idx}`}
                  className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.35)] backdrop-blur"
                >
                  <div className="h-3 w-24 rounded-full bg-slate-200/70" />
                  <div className="mt-2 h-3 w-20 rounded-full bg-slate-200/80" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between animate-pulse">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded-full bg-slate-200/70" />
            <div className="h-6 w-64 rounded-full bg-slate-200/80" />
            <div className="h-4 w-80 rounded-full bg-slate-200/70" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-8 w-24 rounded-full bg-slate-200/80" />
            <div className="h-8 w-32 rounded-full bg-slate-200/70" />
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 mt-12 pb-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={`grid-skel-${idx}`}
              className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/80 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.35)] backdrop-blur animate-pulse"
            >
              <div className="h-52 bg-slate-200/70" />
              <div className="space-y-3 px-6 pb-6 pt-4">
                <div className="space-y-2">
                  <div className="h-4 w-3/4 rounded-full bg-slate-200/80" />
                  <div className="h-3 w-5/6 rounded-full bg-slate-200/70" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="h-3 w-24 rounded-full bg-slate-200/70" />
                  <div className="h-3 w-16 rounded-full bg-slate-200/70" />
                </div>
                <div className="h-8 w-full rounded-full bg-slate-200/80" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
