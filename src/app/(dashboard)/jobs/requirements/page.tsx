import Link from "next/link";
import { RequirementsFiller } from "./requirements-filler";

export default function JobRequirementsPage() {
  return (
    <div>
      <Link href="/jobs" className="text-sm text-gray-500 hover:text-cyan-600">
        ← חזרה למשרות
      </Link>
      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold">מילוי דרישות למשרות</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          מה שנכתב כאן הוא מה שגובגט אומר למועמד כששואלים &quot;מה צריך בשביל התפקיד?&quot;
        </p>
      </div>
      <RequirementsFiller />
    </div>
  );
}
