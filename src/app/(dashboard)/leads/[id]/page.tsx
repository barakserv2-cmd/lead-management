export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">פרטי ליד</h1>
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <p className="text-gray-500">Lead ID: {id}</p>
        <p className="text-gray-400 mt-4">פרטי הליד יוצגו כאן לאחר חיבור Supabase.</p>
      </div>
    </div>
  );
}
