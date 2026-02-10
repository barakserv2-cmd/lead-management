export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">דשבורד</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "לידים חדשים", value: "0", color: "bg-blue-50 text-blue-700" },
          { label: "בסינון", value: "0", color: "bg-yellow-50 text-yellow-700" },
          { label: "מתאימים", value: "0", color: "bg-green-50 text-green-700" },
          { label: "הושמו", value: "0", color: "bg-emerald-50 text-emerald-700" },
        ].map((card) => (
          <div
            key={card.label}
            className={`${card.color} rounded-xl p-6 border`}
          >
            <p className="text-sm font-medium opacity-80">{card.label}</p>
            <p className="text-3xl font-bold mt-2">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
