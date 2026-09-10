import Link from "next/link";
import { ClosuresManager } from "./closures-manager";

export default function ClosuresPage() {
  return (
    <div>
      <Link href="/settings" className="text-sm text-gray-500 hover:text-cyan-600">
        ← חזרה להגדרות
      </Link>
      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold">ימי סגירה</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          ימים שבהם לא ייקבעו ראיונות — לא על ידי רכזת ולא על ידי גובגט
        </p>
      </div>
      <ClosuresManager />
    </div>
  );
}
