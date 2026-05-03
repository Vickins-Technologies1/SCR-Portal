export default function Loading() {
  return (
    <div className="min-h-screen bg-[#f7f6f3] pt-28">
      <div className="max-w-7xl mx-auto px-6">
        <div className="h-10 w-2/3 rounded-2xl bg-white/70 shadow-sm animate-pulse" />
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={`market-skel-${idx}`}
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
      </div>
    </div>
  );
}

