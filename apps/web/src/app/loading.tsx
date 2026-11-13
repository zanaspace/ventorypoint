export default function RootLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        <span className="text-xs text-muted-foreground font-medium">Loading VentoryPoint...</span>
      </div>
    </div>
  );
}

