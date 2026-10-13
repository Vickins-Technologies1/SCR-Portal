import type { CSSProperties } from "react";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
};

/** A theme-aware, screen-reader-hidden placeholder used by loading layouts. */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={`loading-skeleton block rounded-lg ${className}`.trim()}
      style={style}
    />
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="surface-card rounded-2xl p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-7 w-28" />
          <Skeleton className="mt-3 h-3 w-36 max-w-full" />
        </div>
      ))}
    </div>
  );
}

export function TableRowsSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="divide-y divide-border" aria-hidden="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="grid items-center gap-4 px-4 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton key={column} className={`h-4 ${column === 0 ? "w-3/4" : "w-1/2"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageContentSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56 max-w-[75vw]" />
        <Skeleton className="h-4 w-80 max-w-[90vw]" />
      </div>
      <CardGridSkeleton count={3} />
      <section className="surface-card overflow-hidden rounded-2xl">
        <div className="border-b border-border px-4 py-4"><Skeleton className="h-4 w-36" /></div>
        <TableRowsSkeleton rows={5} columns={4} />
      </section>
    </div>
  );
}

export function AuthLoadingFallback() {
  return (
    <div className="mx-auto w-full max-w-md space-y-4 rounded-2xl p-6" aria-busy="true" aria-label="Loading page">
      <Skeleton className="mx-auto h-10 w-10 rounded-xl" />
      <Skeleton className="mx-auto h-6 w-48 max-w-full" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
    </div>
  );
}
