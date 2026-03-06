"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-bold text-gray-800">שגיאה בטעינת הדף</h2>
        <p className="text-sm text-gray-500">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700"
        >
          נסה שוב
        </button>
      </div>
    </div>
  );
}
