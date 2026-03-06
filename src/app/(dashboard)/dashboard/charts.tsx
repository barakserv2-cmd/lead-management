"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const PIE_COLORS = [
  "#0891b2", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // red
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];

export function LeadsPerDayChart({
  data,
}: {
  data: { day: string; count: number }[];
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold mb-4">לידים לפי יום</h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Bar dataKey="count" name="לידים" fill="#0891b2" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LeadsBySourceChart({
  data,
}: {
  data: { source: string; count: number }[];
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <h2 className="text-lg font-semibold mb-4">לידים לפי מקור</h2>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="source"
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={50}
              paddingAngle={3}
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => (
                <span style={{ color: "#475569", fontSize: 12 }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
