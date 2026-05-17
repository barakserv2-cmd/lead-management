export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="h-8 w-48 bg-gray-200 rounded mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-gray-200 rounded-xl" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 bg-gray-200 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
