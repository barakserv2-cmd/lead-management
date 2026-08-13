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

function ChevronLeftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="m15 18-6-6 6-6" />
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

function FolderRow({
  href,
  icon,
  label,
  total,
  newCount,
  inProgress,
  success,
  closed,
  bold,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  total: number;
  newCount: number;
  inProgress: number;
  success: number;
  closed: number;
  bold?: boolean;
}) {
  const pct = total > 0 ? Math.round((success / total) * 100) : 0;
  const colors = successColor(pct);
  return (
    <Link
      href={href}
      className={`flex items-center gap-4 px-4 py-3 hover:bg-cyan-50/40 transition-colors group ${bold ? "bg-slate-50/60" : ""}`}
    >
      {icon}

      {/* שם + כמות */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm text-gray-900 truncate ${bold ? "font-bold" : "font-semibold"}`}>{label}</div>
        <div className="text-xs text-gray-500">{total} לידים</div>
      </div>

      {/* מונים */}
      <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
        {newCount > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
            {newCount} חדשים
          </span>
        )}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
          {inProgress} בתהליך
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700">
          {success} התקבלו
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-400">
          {closed} נסגרו
        </span>
      </div>

      {/* אחוז הצלחה */}
      <div className="flex items-center gap-2 w-36 flex-shrink-0">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <span className={`text-xs font-bold w-9 text-left ${colors.text}`}>{pct}%</span>
      </div>

      <span className="text-gray-300 group-hover:text-cyan-500 transition-colors flex-shrink-0">
        <ChevronLeftIcon />
      </span>
    </Link>
  );
}

export function FoldersView({ folders }: { folders: SourceFolderStats[] }) {
  const grand = folders.reduce(
    (acc, f) => ({
      total: acc.total + f.total,
      newCount: acc.newCount + f.newCount,
      inProgress: acc.inProgress + f.inProgress,
      success: acc.success + f.success,
      closed: acc.closed + f.closed,
    }),
    { total: 0, newCount: 0, inProgress: 0, success: 0, closed: 0 }
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100 overflow-hidden">
      <FolderRow
        href="/leads?source=__all__"
        icon={<FolderIcon className="w-8 h-8 text-cyan-500 flex-shrink-0" />}
        label="כל הלידים"
        bold
        {...grand}
      />
      {folders.map((folder, i) => (
        <FolderRow
          key={folder.key}
          href={`/leads?source=${encodeURIComponent(folder.key)}`}
          icon={<FolderIcon className={`w-8 h-8 flex-shrink-0 ${FOLDER_ACCENTS[i % FOLDER_ACCENTS.length]}`} />}
          label={folder.label}
          total={folder.total}
          newCount={folder.newCount}
          inProgress={folder.inProgress}
          success={folder.success}
          closed={folder.closed}
        />
      ))}
    </div>
  );
}
