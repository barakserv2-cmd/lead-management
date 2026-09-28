import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h2 className="text-4xl font-bold text-gray-800">404</h2>
        <p className="text-gray-500">העמוד לא נמצא</p>
        <Link href="/leads" className="inline-block px-4 py-2 bg-cyan-600 text-white rounded-md text-sm font-medium hover:bg-cyan-700">
          חזרה לדף הראשי
        </Link>
      </div>
    </div>
  );
}
