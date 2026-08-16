// שלד טעינה לעמוד הלידים — מופיע מיידית בכל ניווט (תיקיות/תור/עמודים)
// כך שהמעבר מרגיש חלק במקום מסך קפוא עד שהשרת עונה.
export default function LeadsLoading() {
  return (
    <div className="animate-pulse">
      {/* כותרת */}
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-48 bg-gray-200 rounded-lg" />
        <div className="h-9 w-28 bg-gray-200 rounded-lg" />
      </div>

      {/* טאבים */}
      <div className="flex items-center gap-1 mb-5 bg-gray-100 rounded-lg p-1 w-fit">
        <div className="h-9 w-36 bg-white rounded-md shadow-sm" />
        <div className="h-9 w-40 bg-gray-100 rounded-md" />
        <div className="h-9 w-24 bg-gray-100 rounded-md" />
      </div>

      {/* שורות טבלה */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="h-11 bg-slate-50/80 border-b border-slate-200" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-gray-100">
            <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
            <div className="h-3.5 w-32 bg-gray-200 rounded" />
            <div className="h-3.5 w-24 bg-gray-100 rounded" />
            <div className="h-6 w-20 bg-gray-100 rounded-full mr-auto" />
            <div className="h-6 w-24 bg-gray-100 rounded-full" />
            <div className="h-6 w-16 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
