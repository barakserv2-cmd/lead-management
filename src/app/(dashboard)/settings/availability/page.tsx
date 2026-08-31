import { AvailabilityClient } from "./availability-client";

// מסך זמינות ראיונות — כל רכזת מגדירה פעם אחת את החלונות השבועיים
// שלה, ומהם נגזרים המועדים שהמועמדים רואים בלינק התיאום העצמי.
export default function AvailabilityPage() {
  return (
    <div className="p-6 max-w-3xl" dir="rtl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">זמינות ראיונות</h1>
      <p className="text-sm text-gray-500 mb-6">
        החלונות השבועיים שלך לתיאום ראיון עצמי. המועמד רואה רק שעות
        פנויות בתוך החלונות האלה — 14 יום קדימה, בניכוי מה שכבר נקבע.
      </p>
      <AvailabilityClient />
    </div>
  );
}
