import Link from "next/link";

export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  searchQuery = "",
  className = "",
}: {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  searchQuery?: string;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalCount);

  function buildHref(page: number) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (searchQuery) params.set("q", searchQuery);
    return `/leads?${params.toString()}`;
  }

  // Build page numbers to show: always show first, last, current, and neighbors
  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <div className={`flex items-center justify-between bg-white rounded-xl shadow-sm border px-4 py-3 ${className}`}>
      <span className="text-sm text-gray-500">
        {from}–{to} מתוך {totalCount}
      </span>

      <div className="flex items-center gap-1">
        {currentPage > 1 ? (
          <Link
            href={buildHref(currentPage - 1)}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-gray-50 transition-colors"
          >
            הקודם
          </Link>
        ) : (
          <span className="px-3 py-1.5 text-sm rounded-md border text-gray-300 cursor-not-allowed">
            הקודם
          </span>
        )}

        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`dots-${i}`} className="px-2 py-1.5 text-sm text-gray-400">
              ...
            </span>
          ) : (
            <Link
              key={p}
              href={buildHref(p)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                p === currentPage
                  ? "bg-blue-600 text-white border-blue-600"
                  : "hover:bg-gray-50"
              }`}
            >
              {p}
            </Link>
          )
        )}

        {currentPage < totalPages ? (
          <Link
            href={buildHref(currentPage + 1)}
            className="px-3 py-1.5 text-sm rounded-md border hover:bg-gray-50 transition-colors"
          >
            הבא
          </Link>
        ) : (
          <span className="px-3 py-1.5 text-sm rounded-md border text-gray-300 cursor-not-allowed">
            הבא
          </span>
        )}
      </div>
    </div>
  );
}
