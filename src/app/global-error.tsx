"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold text-gray-800">משהו השתבש</h2>
          <p className="text-sm text-gray-500">{error.message}</p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            נסה שוב
          </button>
        </div>
      </body>
    </html>
  );
}
