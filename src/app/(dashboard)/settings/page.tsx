export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">הגדרות</h1>
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-2">ניהול משתמשים</h2>
          <p className="text-gray-400">הוספה ועריכה של מגייסים ואדמינים.</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-2">תבניות הודעות</h2>
          <p className="text-gray-400">עריכת תבניות וואטסאפ ואימייל.</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-2">חיבור Gmail</h2>
          <p className="text-gray-400">הגדרת חיבור Gmail API לקליטת מיילים.</p>
        </div>
      </div>
    </div>
  );
}
