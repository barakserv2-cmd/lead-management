'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, PlusCircle, X, Save, Pencil, Trash2, Search, UserPlus, CheckCircle, Clock, AlertTriangle, MapPin } from 'lucide-react';

export default function ExtrasPage() {
  const supabase = createClient();

  // --- Data States ---
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<Record<string, any>>({});

  // --- UI States: Modal (שיבוץ) ---
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<any>(null);
  const [unitFormData, setUnitFormData] = useState({ role: 'מלצרים', quantity: 0 });

  // --- Worker Assignment States (חדש!) ---
  const [assignedWorkers, setAssignedWorkers] = useState<any[]>([]); // רשימת המשובצים כרגע
  const [workerSearchTerm, setWorkerSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // --- UI States: Campaign Modal ---
  const [isCampModalOpen, setIsCampModalOpen] = useState(false);
  const [campFormData, setCampFormData] = useState({ name: '', start_date: '', end_date: '' });

  const [loading, setLoading] = useState(false);

  // 1. אתחול
  useEffect(() => { fetchCampaignsAndClients(); }, []);
  useEffect(() => { if (selectedCampaign) fetchMatrix(); }, [selectedCampaign]);

  // 2. חיפוש עובדים בזמן אמת (חדש!)
  useEffect(() => {
    const searchWorkers = async () => {
      if (workerSearchTerm.length < 2) { setSearchResults([]); return; }
      const { data } = await supabase
        .from('workers')
        .select('*')
        .ilike('full_name', `%${workerSearchTerm}%`)
        .limit(5);
      if (data) setSearchResults(data);
    };
    const timeoutId = setTimeout(searchWorkers, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [workerSearchTerm]);

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

  // --- טעינת העובדים המשובצים ליחידה הספציפית ---
  async function fetchAssignedWorkers(demandUnitId: string) {
    if (!demandUnitId) return;
    const { data } = await supabase
      .from('campaign_assignments')
      .select('*, workers(full_name, phone)')
      .eq('demand_unit_id', demandUnitId)
      .order('created_at', { ascending: true });

    if (data) setAssignedWorkers(data);
  }

  // --- פתיחת חלון השיבוץ ---
  const handleCellClick = async (client: any, date: string, existingData: any) => {
    setEditingCell({ client, date, id: existingData?.id });

    // אם כבר יש דרישה קיימת, נטען אותה
    if (existingData) {
      setUnitFormData({
        role: existingData.role,
        quantity: existingData.quantity
      });
      // טעינת עובדים משובצים
      await fetchAssignedWorkers(existingData.id);
    } else {
      // דרישה חדשה
      setUnitFormData({ role: 'מלצרים', quantity: 5 });
      setAssignedWorkers([]);
    }

    setIsUnitModalOpen(true);
  };

  // --- שמירת הגדרות הדרישה (כמות/תפקיד) ---
  const handleSaveUnitSettings = async () => {
    setLoading(true);
    const payload = {
      campaign_id: selectedCampaign.id,
      client_id: editingCell.client.id,
      date: editingCell.date,
      role: unitFormData.role,
      quantity: Number(unitFormData.quantity)
    };

    let newUnitId = editingCell.id;

    if (editingCell.id) {
      await supabase.from('demand_units').update(payload).eq('id', editingCell.id);
    } else {
      const { data, error } = await supabase.from('demand_units').insert([payload]).select().single();
      if (data) {
        newUnitId = data.id;
        setEditingCell({ ...editingCell, id: newUnitId }); // עדכון ה-ID שנוצר
      }
    }

    fetchMatrix(); // רענון הטבלה בחוץ
    setLoading(false);
    return newUnitId;
  };

  // --- שיבוץ עובד (Assign) ---
  const handleAssignWorker = async (worker: any) => {
    // 1. קודם כל מוודאים שיש יחידת דרישה שמורה
    let unitId = editingCell.id;
    if (!unitId) {
      unitId = await handleSaveUnitSettings();
    }

    // 2. בדיקה האם כבר משובץ כאן
    if (assignedWorkers.find(a => a.worker_id === worker.id)) {
      alert('עובד זה כבר משובץ למשמרת זו');
      return;
    }

    // 3. יצירת השיבוץ
    const { error } = await supabase.from('campaign_assignments').insert([{
      demand_unit_id: unitId,
      worker_id: worker.id,
      status: 'Matched' // סטטוס התחלתי
    }]);

    if (error) alert('שגיאה בשיבוץ: ' + error.message);
    else {
      setWorkerSearchTerm(''); // ניקוי חיפוש
      fetchAssignedWorkers(unitId); // רענון רשימה
    }
  };

  // --- שינוי סטטוס עובד (הלוגיקה החכמה) ---
  const handleStatusChange = async (assignmentId: string, newStatus: string) => {
    // שימוש בפונקציית ה-RPC שיצרנו ב-SQL
    const { data, error } = await supabase.rpc('transition_assignment_status', {
      p_assignment_id: assignmentId,
      p_new_status: newStatus
    });

    if (error) {
      alert('שגיאה: ' + error.message);
    } else if (data.status === 'ERROR') {
      alert(data.message);
    } else {
      // הצלחה
      fetchAssignedWorkers(editingCell.id);
    }
  };

  // --- עזרים ---
  const getDatesInRange = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return [];
    const dates = [];
    const curr = new Date(startDate);
    const end = new Date(endDate);
    let i = 0;
    while (curr <= end && i < 60) {
      dates.push(new Date(curr).toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
      i++;
    }
    return dates;
  };

  // רכיב כפתור סטטוס
  const StatusBadge = ({ status, onClick }: any) => {
    let style = "bg-gray-100 text-gray-600 border-gray-200";
    let icon = <Clock size={14} />;
    let label = "נמצא";

    if (status === 'Assigned') { style = "bg-yellow-100 text-yellow-700 border-yellow-200"; label = "שובץ"; }
    if (status === 'Confirmed') { style = "bg-blue-100 text-blue-700 border-blue-200"; label = "אושר"; icon = <CheckCircle size={14} />; }
    if (status === 'Arrived') { style = "bg-green-100 text-green-700 border-green-200"; label = "הגיע"; icon = <MapPin size={14} />; }
    if (status === 'No Show') { style = "bg-red-100 text-red-700 border-red-200"; label = "הבריז"; icon = <AlertTriangle size={14} />; }

    return (
      <button onClick={onClick} className={`px-2 py-1 rounded-md border text-xs font-bold flex items-center gap-1 ${style} hover:opacity-80 transition`}>
        {icon} {label}
      </button>
    );
  };

  if (!selectedCampaign) return <div className="p-10 text-center">טוען...</div>;
  const dates = getDatesInRange(selectedCampaign.start_date, selectedCampaign.end_date);

  return (
    <div className="p-6 max-w-[1800px] mx-auto dir-rtl font-sans text-gray-800">

      {/* HEADER (כמו קודם) */}
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="bg-purple-100 p-3 rounded-full text-purple-600"><Calendar size={24} /></div>
          <div>
            <h1 className="text-2xl font-bold">{selectedCampaign.name}</h1>
          </div>
        </div>
        <select
          className="border rounded p-2 bg-gray-50"
          value={selectedCampaign.id}
          onChange={(e) => {
            const c = campaigns.find(x => x.id === e.target.value);
            if(c) setSelectedCampaign(c);
          }}
        >
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* MATRIX TABLE (כמו קודם, עם עדכון קטן לתצוגה) */}
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
                      className={`p-1 border-b border-l cursor-pointer h-20 transition-colors ${unit ? (isFull ? 'bg-green-50' : 'bg-orange-50') : 'hover:bg-gray-100'}`}
                    >
                      {unit ? (
                        <div className="flex flex-col items-center justify-center h-full">
                          <span className={`font-bold text-xl ${isFull ? 'text-green-700' : 'text-orange-600'}`}>
                            {unit.filled_count}/{unit.quantity}
                          </span>
                          <span className="text-[10px] text-gray-600 mb-1">{unit.role}</span>
                          {/* אינדיקטורים קטנים למטה */}
                          <div className="flex gap-0.5">
                             {/* כאן אפשר להוסיף נקודות צבעוניות לפי הסטטוסים של העובדים */}
                          </div>
                        </div>
                      ) : (
                        <PlusCircle className="mx-auto w-6 h-6 opacity-0 hover:opacity-40 text-gray-400" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- MODAL 2: שיבוץ כוח אדם (המשודרג!) --- */}
      {isUnitModalOpen && editingCell && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex overflow-hidden">

            {/* צד ימין: הגדרות וחיפוש עובדים */}
            <div className="w-1/3 bg-gray-50 border-l p-6 flex flex-col gap-6">
              <div>
                <h3 className="font-bold text-lg text-gray-800 mb-1">{editingCell.client.name}</h3>
                <p className="text-sm text-gray-500">{new Date(editingCell.date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>

              {/* טופס הגדרות */}
              <div className="space-y-3 bg-white p-4 rounded-lg border shadow-sm">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">תפקיד</label>
                  <select
                    className="w-full border-b py-1 bg-transparent font-medium outline-none"
                    value={unitFormData.role}
                    onChange={(e) => setUnitFormData({...unitFormData, role: e.target.value})}
                  >
                    <option>מלצרים</option>
                    <option>טבחים</option>
                    <option>חדרניות</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">כמות נדרשת</label>
                  <input
                    type="number"
                    className="w-full border-b py-1 bg-transparent font-medium outline-none"
                    value={unitFormData.quantity}
                    onChange={(e) => setUnitFormData({...unitFormData, quantity: Number(e.target.value)})}
                  />
                </div>
                <button onClick={handleSaveUnitSettings} className="w-full mt-2 py-1.5 bg-gray-800 text-white text-sm rounded hover:bg-black">
                  עדכן דרישה
                </button>
              </div>

              {/* חיפוש עובדים */}
              <div className="flex-1 flex flex-col">
                <label className="text-xs font-bold text-gray-500 uppercase mb-2">הוסף עובד למשמרת</label>
                <div className="relative">
                  <Search className="absolute right-3 top-2.5 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="חפש שם עובד..."
                    className="w-full pl-3 pr-9 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    value={workerSearchTerm}
                    onChange={(e) => setWorkerSearchTerm(e.target.value)}
                  />
                </div>

                {/* תוצאות חיפוש */}
                <div className="mt-2 flex-1 overflow-y-auto space-y-2">
                  {searchResults.map(worker => (
                    <div key={worker.id} className="flex justify-between items-center p-3 bg-white border rounded-lg hover:border-purple-300 shadow-sm group">
                      <div>
                        <div className="font-bold text-sm">{worker.full_name}</div>
                        <div className="text-xs text-gray-500">{worker.phone}</div>
                      </div>
                      <button
                        onClick={() => handleAssignWorker(worker)}
                        className="bg-purple-50 text-purple-700 p-1.5 rounded-full hover:bg-purple-600 hover:text-white transition"
                      >
                        <UserPlus size={18} />
                      </button>
                    </div>
                  ))}
                  {workerSearchTerm.length > 1 && searchResults.length === 0 && (
                    <div className="text-center text-sm text-gray-400 mt-4">לא נמצאו עובדים</div>
                  )}
                </div>
              </div>
            </div>

            {/* צד שמאל: רשימת המשובצים */}
            <div className="w-2/3 p-6 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-xl">
                  משובצים ({assignedWorkers.length}/{unitFormData.quantity})
                </h3>
                <button onClick={() => setIsUnitModalOpen(false)} className="hover:bg-gray-100 p-2 rounded-full"><X size={24}/></button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-right">
                  <thead className="text-xs text-gray-400 border-b">
                    <tr>
                      <th className="pb-2 font-medium">שם העובד</th>
                      <th className="pb-2 font-medium">טלפון</th>
                      <th className="pb-2 font-medium">סטטוס</th>
                      <th className="pb-2 font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {assignedWorkers.map((assignment) => (
                      <tr key={assignment.id} className="group hover:bg-gray-50">
                        <td className="py-3 font-medium">{assignment.workers?.full_name}</td>
                        <td className="py-3 text-sm text-gray-500">{assignment.workers?.phone}</td>
                        <td className="py-3">
                          <StatusBadge
                            status={assignment.status}
                            onClick={() => {
                              // סייקל של סטטוסים בלחיצה: Matched -> Assigned -> Confirmed -> Arrived
                              const nextStatus =
                                assignment.status === 'Matched' ? 'Assigned' :
                                assignment.status === 'Assigned' ? 'Confirmed' :
                                assignment.status === 'Confirmed' ? 'Arrived' : 'Matched';
                              handleStatusChange(assignment.id, nextStatus);
                            }}
                          />
                        </td>
                        <td className="py-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => {
                              if(confirm('למחוק שיבוץ?')) {
                                supabase.from('campaign_assignments').delete().eq('id', assignment.id).then(() => fetchAssignedWorkers(editingCell.id));
                              }
                            }}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {assignedWorkers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-gray-400">
                          עדיין לא שובצו עובדים למשמרת זו.<br/>
                          השתמש בחיפוש מימין כדי להוסיף.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
