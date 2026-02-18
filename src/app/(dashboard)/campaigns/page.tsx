'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, PlusCircle, X, Save } from 'lucide-react';

export default function ExtrasPage() {
  const supabase = createClient();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<Record<string, any>>({});

  // --- ניהול החלון הקופץ (Modal) ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<any>(null);
  const [formData, setFormData] = useState({ role: 'מלצרים', quantity: 0, notes: '' });
  const [loading, setLoading] = useState(false);

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
    }
    initData();
  }, []);

  // 2. טעינת המטריצה
  useEffect(() => {
    if (!selectedCampaign) return;
    fetchMatrix();
  }, [selectedCampaign]);

  async function fetchMatrix() {
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
  }

  // --- פתיחת החלון ---
  const handleCellClick = (client: any, date: string, existingData: any) => {
    setEditingCell({ client, date, id: existingData?.id });
    setFormData({
      role: existingData?.role || 'מלצרים',
      quantity: existingData?.quantity || 5,
      notes: existingData?.notes || ''
    });
    setIsModalOpen(true);
  };

  // --- שמירה למסד הנתונים ---
  const handleSave = async () => {
    if (!selectedCampaign || !editingCell) return;
    setLoading(true);

    const payload = {
      campaign_id: selectedCampaign.id,
      client_id: editingCell.client.id,
      date: editingCell.date,
      role: formData.role,
      quantity: parseInt(formData.quantity.toString()),
    };

    let error;
    if (editingCell.id) {
      const res = await supabase.from('demand_units').update(payload).eq('id', editingCell.id);
      error = res.error;
    } else {
      const res = await supabase.from('demand_units').insert([payload]);
      error = res.error;
    }

    if (error) {
      alert('שגיאה בשמירה: ' + error.message);
    } else {
      setIsModalOpen(false);
      fetchMatrix();
    }
    setLoading(false);
  };

  // --- עזרי תאריכים ---
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

  if (!selectedCampaign) return <div className="p-10 text-center">טוען נתונים...</div>;
  const dates = getDatesInRange(selectedCampaign.start_date, selectedCampaign.end_date);

  return (
    <div className="p-6 max-w-[1800px] mx-auto font-sans text-gray-800" dir="rtl">

      {/* כותרת */}
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="bg-purple-100 p-3 rounded-full text-purple-600">
            <Calendar size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ניהול אקסטרות</h1>
            <p className="text-gray-500 text-sm">פרויקט: {selectedCampaign.name}</p>
          </div>
        </div>
        <select
          className="border border-gray-300 rounded-lg p-2 font-medium bg-gray-50"
          onChange={(e) => {
            const c = campaigns.find(x => x.id === e.target.value);
            if (c) setSelectedCampaign(c);
          }}
          value={selectedCampaign.id}
        >
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* המטריצה */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-x-auto pb-4">
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
                <td className="p-3 text-right font-medium border-b border-l sticky right-0 bg-white z-10 shadow-sm">{client.name}</td>
                {dates.map(date => {
                  const key = `${client.id}_${date}`;
                  const unit = matrix[key];

                  if (unit) {
                    const isFull = unit.filled_count >= unit.quantity;
                    return (
                      <td
                        key={key}
                        onClick={() => handleCellClick(client, date, unit)}
                        className={`p-1 border-b border-l cursor-pointer h-16 transition-colors ${isFull ? 'bg-green-50 hover:bg-green-100' : 'bg-orange-50 hover:bg-orange-100'}`}
                      >
                        <div className="flex flex-col items-center justify-center h-full">
                          <span className={`font-bold text-lg ${isFull ? 'text-green-700' : 'text-orange-600'}`}>
                            {unit.filled_count}/{unit.quantity}
                          </span>
                          <span className="text-[10px] text-gray-600 font-medium">{unit.role}</span>
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={key}
                      className="p-1 border-b border-l h-16 text-gray-200 hover:bg-gray-100 cursor-pointer transition-colors group"
                      onClick={() => handleCellClick(client, date, null)}
                    >
                      <PlusCircle className="mx-auto w-5 h-5 opacity-0 group-hover:opacity-50 text-gray-400 transition-opacity" />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- חלון עריכה (Modal) --- */}
      {isModalOpen && editingCell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">

            <div className="bg-purple-600 p-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg">דרישת כוח אדם</h3>
              <button onClick={() => setIsModalOpen(false)} className="hover:bg-purple-700 p-1 rounded"><X size={20}/></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-purple-50 p-3 rounded-lg text-sm text-purple-900 mb-2">
                <div><strong>לקוח:</strong> {editingCell.client.name}</div>
                <div><strong>תאריך:</strong> {new Date(editingCell.date).toLocaleDateString('he-IL')}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד נדרש</label>
                <select
                  className="w-full border rounded-lg p-2.5 focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                >
                  <option>מלצרים</option>
                  <option>טבחים</option>
                  <option>חדרניות</option>
                  <option>שטחים ציבוריים</option>
                  <option>שטיפת כלים</option>
                  <option>קב&quot;טים</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">כמות עובדים נדרשת</label>
                <div className="flex items-center border rounded-lg overflow-hidden">
                  <button onClick={() => setFormData({...formData, quantity: Math.max(0, formData.quantity - 1)})} className="p-3 bg-gray-100 hover:bg-gray-200">-</button>
                  <input
                    type="number"
                    className="w-full text-center p-2 outline-none"
                    value={formData.quantity}
                    onChange={(e) => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
                  />
                  <button onClick={() => setFormData({...formData, quantity: formData.quantity + 1})} className="p-3 bg-gray-100 hover:bg-gray-200">+</button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">ביטול</button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 flex items-center gap-2 shadow-sm"
              >
                <Save size={18} />
                {loading ? 'שומר...' : 'שמור דרישה'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
