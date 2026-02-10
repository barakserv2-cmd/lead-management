export default function LeadsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">לידים</h1>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="חיפוש..."
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-right font-medium text-gray-600">שם</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">טלפון</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">תפקיד</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">סטטוס</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">מקור</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">תאריך</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                אין לידים עדיין. חבר את Gmail כדי להתחיל.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
