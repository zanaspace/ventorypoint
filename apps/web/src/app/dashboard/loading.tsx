export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top indeterminate indicator */}
      <div className="fixed top-0 left-0 right-0 h-0.5 bg-border overflow-hidden z-50 pointer-events-none">
        <div className="h-full bg-brand w-2/5 animate-[pulse_1s_ease-in-out_infinite]" />
      </div>

      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted rounded-md" />
          <div className="h-3.5 w-72 bg-muted/60 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-muted rounded-lg" />
          <div className="h-9 w-32 bg-muted rounded-lg" />
        </div>
      </div>

      {/* Control / Filter Bar Skeleton */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3 rounded-xl bg-surface border border-border">
        <div className="h-9 flex-1 bg-muted/60 rounded-lg" />
        <div className="h-9 w-full sm:w-36 bg-muted/60 rounded-lg" />
        <div className="h-9 w-full sm:w-36 bg-muted/60 rounded-lg" />
      </div>

      {/* Content Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="p-4 rounded-xl border border-border bg-surface space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-4 w-28 bg-muted rounded" />
              <div className="h-5 w-16 bg-muted/70 rounded-full" />
            </div>
            <div className="h-3 w-40 bg-muted/50 rounded" />
            <div className="h-10 w-full bg-muted/30 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

