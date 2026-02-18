'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, PlusCircle, X, Save, Pencil, Trash2 } from 'lucide-react';

export default function ExtrasPage() {
  const supabase = createClient();

  // --- Data States ---
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<Record<string, any>>({});

  // --- UI States ---
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<any>(null);
  const [unitFormData, setUnitFormData] = useState({ role: 'מלצרים', quantity: 0 });

  const [isCampModalOpen, setIsCampModalOpen] = useState(false);
  const [campFormData, setCampFormData] = useState({ name: '', start_date: '', end_date: '' });

  const [loading, setLoading] = useState(false);

  // 1. אתחול נתונים
  useEffect(() => {
    fetchCampaignsAndClients();
  }, []);

  // 2. טעינת מטריצה
  useEffect(() => {
    if (selectedCampaign) fetchMatrix();
  }, [selectedCampaign]);

  async function fetchCampaignsAndClients() {
    const { data: camps } = await supabase.from('campaigns').select('*').order('start_date', { ascending: false });
    const { data: cls } = await supabase.from('clients').select('id, name').eq('status', 'Active');

    if (camps && camps.length > 0) {
      setCampaigns(camps);
      if (!selectedCampaign) setSelectedCampaign(camps[0]);
    }
    if (cls) setClients(cls);
  }

  async function fetchMatrix() {
    const { data } = await supabase.from('demand_units').select('*').eq('campaign_id', selectedCampaign.id);
    const matrixMap: Record<string, any> = {};
    data?.forEach((unit: any) => {
      matrixMap[`${unit.client_id}_${unit.date}`] = unit;
    });
    setMatrix(matrixMap);
  }

  // --- עריכת קמפיין ---
  const openEditCampaign = () => {
    if (!selectedCampaign) return;
    setCampFormData({
      name: selectedCampaign.name,
      start_date: selectedCampaign.start_date,
      end_date: selectedCampaign.end_date
    });
    setIsCampModalOpen(true);
  };

  const handleSaveCampaign = async () => {
    setLoading(true);

    // ולידציה בסיסית: אם המשתמש הכניס תאריך לא הגיוני, נתקן אותו או נתריע
    if (new Date(campFormData.start_date) > new Date(campFormData.end_date)) {
      alert('תאריך סיום חייב להיות אחרי תאריך התחלה');
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from('campaigns')
      .update(campFormData)
      .eq('id', selectedCampaign.id);

    if (error) {
      alert('שגיאה: ' + error.message);
    } else {
      await fetchCampaignsAndClients();
      setSelectedCampaign({ ...selectedCampaign, ...campFormData });
      setIsCampModalOpen(false);
    }
    setLoading(false);
  };

  // --- מחיקת קמפיין (חדש!) ---
  const handleDeleteCampaign = async () => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את הפרויקט הזה? כל הנתונים יימחקו!')) return;

    setLoading(true);
    const { error } = await supabase.from('campaigns').delete().eq('id', selectedCampaign.id);

    if (error) {
      alert('שגיאה במחיקה');
    } else {
      window.location.reload(); // רענון מלא כדי לאפס הכל
    }
    setLoading(false);
  };

  // --- לוגיקת דרישת עובדים ---
  const handleCellClick = (client: any, date: string, existingData: any) => {
    setEditingCell({ client, date, id: existingData?.id });
    setUnitFormData({
      role: existingData?.role || 'מלצרים',
      quantity: existingData?.quantity || 5
    });
    setIsUnitModalOpen(true);
  };

  const handleSaveUnit = async () => {
    setLoading(true);
    const payload = {
      campaign_id: selectedCampaign.id,
      client_id: editingCell.client.id,
      date: editingCell.date,
      role: unitFormData.role,
      quantity: Number(unitFormData.quantity)
    };

    if (editingCell.id) {
      await supabase.from('demand_units').update(payload).eq('id', editingCell.id);
    } else {
      await supabase.from('demand_units').insert([payload]);
    }

    setIsUnitModalOpen(false);
    fetchMatrix();
    setLoading(false);
  };

  // פונקציה שמייצרת את טווח התאריכים
  const getDatesInRange = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return [];
    const dates = [];
    const curr = new Date(startDate);
    const end = new Date(endDate);

    // מגביל ל-60 יום כדי לא לתקוע את הדפדפן אם בטעות בוחרים טווח ענק
    let safetyCounter = 0;
    while (curr <= end && safetyCounter < 60) {
      dates.push(new Date(curr).toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
      safetyCounter++;
    }
    return dates;
  };

  if (!selectedCampaign) return <div className="p-10 text-center">טוען...</div>;
  const dates = getDatesInRange(selectedCampaign.start_date, selectedCampaign.end_date);

  return (
    <div className="p-6 max-w-[1800px] mx-auto dir-rtl font-sans text-gray-800">

      {/* --- HEADER --- */}
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="bg-purple-100 p-3 rounded-full text-purple-600">
            <Calendar size={24} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{selectedCampaign.name}</h1>
              <button onClick={openEditCampaign} className="text-gray-400 hover:text-blue-600 p-1 rounded-full transition-colors" title="ערוך">
                <Pencil size={18} />
              </button>
              <button onClick={handleDeleteCampaign} className="text-gray-400 hover:text-red-600 p-1 rounded-full transition-colors" title="מחק">
                <Trash2 size={18} />
              </button>
            </div>
            <p className="text-gray-500 text-sm">
              {new Date(selectedCampaign.start_date).toLocaleDateString('he-IL')} - {new Date(selectedCampaign.end_date).toLocaleDateString('he-IL')}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
           {/* כפתור יצירת חדש */}
          <button
            onClick={() => {
               setCampFormData({ name: '', start_date: '', end_date: '' });
               setSelectedCampaign(null); // כדי לסמן שאנחנו יוצרים חדש
               setIsCampModalOpen(true);
            }}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700 flex items-center gap-2"
          >
            <PlusCircle size={18} /> פרויקט חדש
          </button>

          <select
            className="border border-gray-300 rounded-lg p-2 font-medium bg-gray-50 outline-none"
            onChange={(e) => {
              const c = campaigns.find(x => x.id === e.target.value);
              if (c) setSelectedCampaign(c);
            }}
            value={selectedCampaign.id}
          >
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* --- MATRIX TABLE --- */}
      <div className="bg-white rounded-xl shadow border border-gray-200 overflow-x-auto pb-2">
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
                  const isFull = unit && unit.filled_count >= unit.quantity;

                  return (
                    <td
                      key={key}
                      onClick={() => handleCellClick(client, date, unit)}
                      className={`p-1 border-b border-l cursor-pointer h-16 transition-colors ${unit ? (isFull ? 'bg-green-50' : 'bg-orange-50') : 'hover:bg-gray-100'}`}
                    >
                      {unit ? (
                        <div className="flex flex-col items-center justify-center">
                          <span className={`font-bold text-lg ${isFull ? 'text-green-700' : 'text-orange-600'}`}>
                            {unit.filled_count}/{unit.quantity}
                          </span>
                          <span className="text-[10px] text-gray-600">{unit.role}</span>
                        </div>
                      ) : (
                        <PlusCircle className="mx-auto w-5 h-5 opacity-0 hover:opacity-50 text-gray-400" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- MODAL: עריכת / יצירת קמפיין --- */}
      {isCampModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold mb-4">
              {selectedCampaign ? 'עריכת פרויקט' : 'פרויקט חדש'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">שם הקמפיין</label>
                <input
                  type="text"
                  placeholder='למשל: "פסח 2026"'
                  className="w-full border rounded p-2 mt-1 focus:ring-2 focus:ring-purple-500 outline-none"
                  value={campFormData.name}
                  onChange={(e) => setCampFormData({...campFormData, name: e.target.value})}
                />
              </div>

              {/* שיפור: שדות תאריך ברורים */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">תאריך התחלה</label>
                  <input
                    type="date"
                    className="w-full border rounded p-2 mt-1 focus:ring-2 focus:ring-purple-500 outline-none"
                    value={campFormData.start_date}
                    onChange={(e) => setCampFormData({...campFormData, start_date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">תאריך סיום</label>
                  <input
                    type="date"
                    className="w-full border rounded p-2 mt-1 focus:ring-2 focus:ring-purple-500 outline-none"
                    value={campFormData.end_date}
                    onChange={(e) => setCampFormData({...campFormData, end_date: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setIsCampModalOpen(false); if(!selectedCampaign) window.location.reload(); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                ביטול
              </button>

              <button
                onClick={async () => {
                  setLoading(true);
                  // לוגיקה לשמירה (חדש או עדכון)
                  if (selectedCampaign) {
                    // עדכון
                    await handleSaveCampaign();
                  } else {
                    // יצירה חדשה
                    const { data, error } = await supabase.from('campaigns').insert([campFormData]).select();
                    if (error) alert(error.message);
                    else window.location.reload();
                  }
                  setLoading(false);
                }}
                disabled={loading}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-bold"
              >
                {loading ? 'שומר...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: דרישת כוח אדם (ללא שינוי) --- */}
      {isUnitModalOpen && editingCell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-purple-600 p-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-lg">דרישת כוח אדם</h3>
              <button onClick={() => setIsUnitModalOpen(false)}><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-purple-50 p-3 rounded text-sm text-purple-900">
                <strong>{editingCell.client.name}</strong> • {new Date(editingCell.date).toLocaleDateString('he-IL')}
              </div>
              <label className="block text-sm font-medium">תפקיד</label>
              <select
                className="w-full border rounded p-2"
                value={unitFormData.role}
                onChange={(e) => setUnitFormData({...unitFormData, role: e.target.value})}
              >
                <option>מלצרים</option>
                <option>טבחים</option>
                <option>חדרניות</option>
                <option>שטחים</option>
                <option>שטיפת כלים</option>
              </select>
              <label className="block text-sm font-medium">כמות</label>
              <input
                type="number"
                className="w-full border rounded p-2"
                value={unitFormData.quantity}
                onChange={(e) => setUnitFormData({...unitFormData, quantity: Number(e.target.value)})}
              />
            </div>
            <div className="p-4 bg-gray-50 border-t flex justify-end gap-3">
              <button onClick={() => setIsUnitModalOpen(false)} className="px-4 py-2 text-gray-600">ביטול</button>
              <button onClick={handleSaveUnit} disabled={loading} className="px-4 py-2 bg-purple-600 text-white rounded font-medium">שמור</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
