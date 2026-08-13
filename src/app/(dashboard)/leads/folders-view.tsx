import Link from "next/link";

// סטטיסטיקות לתיקיית גורם גיוס. success = התקבל + התחיל לעבוד.
export interface SourceFolderStats {
  key: string; // ערך ל-URL: שם המקור, "__none__" ללא מקור, "__all__" לכולם
  label: string;
  total: number;
  newCount: number;
  inProgress: number;
  success: number;
  closed: number;
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 0 1 3 3v1.146A4.483 4.483 0 0 0 19.5 9h-15a4.483 4.483 0 0 0-3 1.146Z" />
    </svg>
  );
}

function successColor(pct: number): { bar: string; text: string } {
  if (pct >= 15) return { bar: "bg-green-500", text: "text-green-700" };
  if (pct >= 5) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-red-400", text: "text-red-600" };
}

const FOLDER_ACCENTS = [
  "text-indigo-400",
  "text-cyan-400",
  "text-amber-400",
  "text-emerald-400",
  "text-violet-400",
  "text-rose-400",
  "text-sky-400",
  "text-orange-400",
];

export function FoldersView({ folders }: { folders: SourceFolderStats[] }) {
  const grandTotal = folders.reduce((s, f) => s + f.total, 0);
  const grandSuccess = folders.reduce((s, f) => s + f.success, 0);
  const grandPct = grandTotal > 0 ? Math.round((grandSuccess / grandTotal) * 100) : 0;

  return (
    <div>
      {/* תיקיית "כל הלידים" */}
      <Link
        href="/leads?source=__all__"
        className="flex items-center gap-4 mb-5 p-4 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-cyan-300 hover:shadow-md transition-all group"
      >
        <FolderIcon className="w-10 h-10 text-cyan-500 group-hover:scale-105 transition-transform" />
        <div className="flex-1">
          <div className="font-bold text-gray-900">כל הלידים</div>
          <div className="text-xs text-gray-500 mt-0.5">{grandTotal} לידים · {grandSuccess} הצלחות</div>
        </div>
        <div className="text-left">
          <div className={`text-lg font-bold ${successColor(grandPct).text}`}>{grandPct}%</div>
          <div className="text-[10px] text-gray-400">הצלחה</div>
        </div>
      </Link>

      {/* רשת תיקיות לפי גורם גיוס */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {folders.map((folder, i) => {
          const pct = folder.total > 0 ? Math.round((folder.success / folder.total) * 100) : 0;
          const colors = successColor(pct);
          return (
            <Link
              key={folder.key}
              href={`/leads?source=${encodeURIComponent(folder.key)}`}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:border-cyan-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <FolderIcon className={`w-9 h-9 ${FOLDER_ACCENTS[i % FOLDER_ACCENTS.length]} group-hover:scale-105 transition-transform`} />
                {folder.newCount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                    {folder.newCount} חדשים
                  </span>
                )}
              </div>

              <div className="font-bold text-gray-900 text-sm leading-snug mb-0.5">{folder.label}</div>
              <div className="text-xs text-gray-500 mb-3">{folder.total} לידים</div>

              {/* פס אחוז הצלחה */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${colors.bar}`}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <span className={`text-xs font-bold ${colors.text}`}>{pct}%</span>
              </div>

              <div className="flex items-center gap-3 text-[10px] text-gray-500">
                <span>✓ {folder.success} התקבלו</span>
                <span>⋯ {folder.inProgress} בתהליך</span>
                <span>✕ {folder.closed} נסגרו</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
