'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, PlusCircle } from 'lucide-react';

export default function ExtrasPage() {
  const supabase = createClient();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // 1. טעינת נתונים ראשונית
  useEffect(() => {
    async function initData() {
      const { data: camps } = await supabase.from('campaigns').select('*').order('start_date', { ascending: false });
      const { data: cls } = await supabase.from('clients').select('id, name').eq('status', 'Active');

      if (camps && camps.length > 0) {
        setCampaigns(camps);
        setSelectedCampaign(camps[0]);
      }

      if (cls) setClients(cls);
      setLoading(false);
    }
    initData();
  }, []);

  // 2. טעינת השיבוצים כשהקמפיין משתנה
  useEffect(() => {
    if (!selectedCampaign) return;

    async function fetchMatrix() {
      setLoading(true);
      const { data } = await supabase
        .from('demand_units')
        .select('*')
        .eq('campaign_id', selectedCampaign.id);

      const matrixMap: Record<string, any> = {};
      data?.forEach((unit: any) => {
        const key = `${unit.client_id}_${unit.date}`;
        matrixMap[key] = unit;
      });

      setMatrix(matrixMap);
      setLoading(false);
    }
    fetchMatrix();
  }, [selectedCampaign]);

  // פונקציית עזר לייצור רשימת תאריכים
  const getDatesInRange = (startDate: string, endDate: string) => {
    const dates: string[] = [];
    const curr = new Date(startDate);
    const end = new Date(endDate);
    while (curr <= end) {
      dates.push(new Date(curr).toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  // --- UI ---
  if (loading && campaigns.length === 0) return <div className="p-10 text-center text-gray-400">טוען...</div>;
  if (campaigns.length === 0) return <div className="p-10 text-center text-gray-500">אין קמפיינים פעילים. צור אחד דרך מסד הנתונים.</div>;
  if (!selectedCampaign) return <div className="p-10 text-center">טוען...</div>;

  const dates = getDatesInRange(selectedCampaign.start_date, selectedCampaign.end_date);

  return (
    <div className="p-6 max-w-[1800px] mx-auto" dir="rtl">

      {/* כותרת ובחירה */}
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-full text-blue-600">
            <Calendar size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">ניהול אקסטרות</h1>
            <p className="text-gray-500 text-sm">מבט על - {selectedCampaign.name}</p>
          </div>
        </div>

        <select
          className="border border-gray-300 rounded-lg p-2 font-medium focus:ring-2 focus:ring-blue-500 outline-none"
          onChange={(e) => {
            const c = campaigns.find(x => x.id === e.target.value);
            if (c) setSelectedCampaign(c);
          }}
          value={selectedCampaign.id}
        >
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* המטריצה הגדולה */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-x-auto">
        <table className="w-full text-center border-collapse">
          <thead>
            <tr>
              <th className="p-4 bg-gray-50 text-right min-w-[180px] border-b border-l font-bold sticky right-0 z-10">לקוח</th>
              {dates.map(date => {
                const d = new Date(date);
                return (
                  <th key={date} className="p-2 min-w-[100px] border-b border-l bg-gray-50">
                    <div className="text-xs text-gray-500">{d.toLocaleDateString('he-IL', { weekday: 'short' })}</div>
                    <div className="font-bold">{d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {clients.map(client => (
              <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-3 text-right font-medium border-b border-l sticky right-0 bg-white z-10">{client.name}</td>

                {dates.map(date => {
                  const key = `${client.id}_${date}`;
                  const unit = matrix[key];

                  if (unit) {
                    const isFull = unit.filled_count >= unit.quantity;
                    const isEmpty = unit.filled_count === 0;

                    return (
                      <td key={key} className={`p-1 border-b border-l cursor-pointer h-16 ${isFull ? 'bg-green-50' : isEmpty ? 'bg-red-50' : 'bg-orange-50'}`}>
                        <div className="flex flex-col items-center justify-center h-full">
                          <span className={`font-bold text-lg ${isFull ? 'text-green-700' : 'text-red-600'}`}>
                            {unit.filled_count}/{unit.quantity}
                          </span>
                          <span className="text-[10px] text-gray-500">{unit.role}</span>
                        </div>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={key}
                      className="p-1 border-b border-l h-16 text-gray-200 hover:bg-gray-100 cursor-pointer transition-colors"
                      onClick={() => alert(`כאן ייפתח חלון להוספת דרישה עבור ${client.name} בתאריך ${date}`)}
                    >
                      <PlusCircle className="mx-auto w-5 h-5 opacity-20 hover:opacity-100 text-gray-400" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
