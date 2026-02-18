'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, PlusCircle, X, Pencil, Trash2, Search, UserPlus, CheckCircle, Clock, AlertTriangle, MapPin, Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx'; // ספריית האקסל

export default function ExtrasPage() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Data States ---
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [matrix, setMatrix] = useState<Record<string, any>>({});

  // --- UI States ---
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<any>(null);
  const [unitFormData, setUnitFormData] = useState({ role: 'מלצרים', quantity: 0 });
  const [assignedWorkers, setAssignedWorkers] = useState<any[]>([]);

  // --- Search & Assign ---
  const [workerSearchTerm, setWorkerSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // --- Campaign Modal ---
  const [isCampModalOpen, setIsCampModalOpen] = useState(false);
  const [campFormData, setCampFormData] = useState({ name: '', start_date: '', end_date: '' });

  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false); // סטייט לטעינת אקסל

  // --- Init ---
  useEffect(() => { fetchCampaignsAndClients(); }, []);
  useEffect(() => { if (selectedCampaign) fetchMatrix(); }, [selectedCampaign]);

  // --- Search Logic ---
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
    const timeoutId = setTimeout(searchWorkers, 300);
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

  async function fetchAssignedWorkers(demandUnitId: string) {
    if (!demandUnitId) return;
    const { data } = await supabase
      .from('campaign_assignments')
      .select('*, workers(full_name, phone)')
      .eq('demand_unit_id', demandUnitId)
      .order('created_at', { ascending: true });

    if (data) setAssignedWorkers(data);
  }

  // --- לוגיקת האקסל החדשה ---
  const handleExcelUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    setImporting(true);
    const reader = new FileReader();

    reader.onload = async (evt: any) => {
      try {
        // 1. קריאת הקובץ
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];

        // המרה ל-JSON (מניח שורה ראשונה כותרות: Name, Phone)
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }); // מערך של מערכים

        // מוודאים שיש יחידת דרישה
        let unitId = editingCell.id;
        if (!unitId) {
          unitId = await handleSaveUnitSettings();
        }

        let successCount = 0;

        // 2. ריצה על השורות (מדלגים על כותרת שורה 0)
        for (let i = 1; i < data.length; i++) {
          const row: any = data[i];
          const name = row[0]; // עמודה A
          let phone = row[1]; // עמודה B

          if (!name || !phone) continue;

          // ניקוי טלפון
          phone = phone.toString().replace(/\D/g, '');
          if (!phone.startsWith('0')) phone = '0' + phone; // תיקון פורמט ישראלי אם צריך

          // 3. מצא או צור עובד (Upsert Logic)
          // ננסה למצוא לפי טלפון
          let { data: existingWorker } = await supabase
            .from('workers')
            .select('id')
            .eq('phone', phone)
            .single();

          let workerId = existingWorker?.id;

          // אם לא קיים - ניצור חדש
          if (!workerId) {
            const { data: newWorker, error: createError } = await supabase
              .from('workers')
              .insert([{ full_name: name, phone: phone, status: 'Active' }])
              .select()
              .single();

            if (newWorker) workerId = newWorker.id;
          }

          // 4. שיבוץ למשמרת
          if (workerId) {
            // בדיקה אם כבר משובץ כדי לא לקבל שגיאה
            const { error: assignError } = await supabase
              .from('campaign_assignments')
              .insert([{
                demand_unit_id: unitId,
                worker_id: workerId,
                status: 'Matched'
              }]);

            if (!assignError) successCount++;
          }
        }

        alert(`הפעולה הסתיימה! ${successCount} עובדים נקלטו ושובצו בהצלחה.`);
        fetchAssignedWorkers(unitId); // רענון מסך

      } catch (error) {
        console.error(error);
        alert('שגיאה בקריאת הקובץ. וודא שהפורמט תקין (שם, טלפון)');
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = ''; // איפוס האינפוט
      }
    };

    reader.readAsBinaryString(file);
  };

  // --- שאר הלוגיקה (זהה לקודם) ---
  const handleCellClick = async (client: any, date: string, existingData: any) => {
    setEditingCell({ client, date, id: existingData?.id });
    if (existingData) {
      setUnitFormData({ role: existingData.role, quantity: existingData.quantity });
      await fetchAssignedWorkers(existingData.id);
    } else {
      setUnitFormData({ role: 'מלצרים', quantity: 5 });
      setAssignedWorkers([]);
    }
    setIsUnitModalOpen(true);
  };

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
      const { data } = await supabase.from('demand_units').insert([payload]).select().single();
      if (data) { newUnitId = data.id; setEditingCell({ ...editingCell, id: newUnitId }); }
    }
    fetchMatrix();
    setLoading(false);
    return newUnitId;
  };

  const handleAssignWorker = async (worker: any) => {
    let unitId = editingCell.id;
    if (!unitId) unitId = await handleSaveUnitSettings();

    if (assignedWorkers.find(a => a.worker_id === worker.id)) { alert('עובד כבר משובץ'); return; }

    const { error } = await supabase.from('campaign_assignments').insert([{
      demand_unit_id: unitId, worker_id: worker.id, status: 'Matched'
    }]);

    if (!error) { setWorkerSearchTerm(''); fetchAssignedWorkers(unitId); }
  };

  const handleStatusChange = async (assignmentId: string, newStatus: string) => {
    const { error } = await supabase.rpc('transition_assignment_status', {
      p_assignment_id: assignmentId, p_new_status: newStatus
    });
    if (!error) fetchAssignedWorkers(editingCell.id);
  };

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

  // Render Logic...
  if (!selectedCampaign) return <div className="p-10 text-center">טוען...</div>;
  const dates = getDatesInRange(selectedCampaign.start_date, selectedCampaign.end_date);

  return (
    <div className="p-6 max-w-[1800px] mx-auto dir-rtl font-sans text-gray-800">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="bg-purple-100 p-3 rounded-full text-purple-600"><Calendar size={24} /></div>
          <div><h1 className="text-2xl font-bold">{selectedCampaign.name}</h1></div>
        </div>
        <div className="flex gap-2">
            <button
                onClick={() => { setCampFormData({ name: '', start_date: '', end_date: '' }); setSelectedCampaign(null); setIsCampModalOpen(true); }}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700 flex items-center gap-2"
            >
                <PlusCircle size={18} /> פרויקט חדש
            </button>
            <select
              className="border rounded p-2 bg-gray-50"
              value={selectedCampaign.id}
              onChange={(e) => { const c = campaigns.find(x => x.id === e.target.value); if(c) setSelectedCampaign(c); }}
            >
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
        </div>
      </div>

      {/* MATRIX TABLE */}
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
                      key={key} onClick={() => handleCellClick(client, date, unit)}
                      className={`p-1 border-b border-l cursor-pointer h-20 transition-colors ${unit ? (isFull ? 'bg-green-50' : 'bg-orange-50') : 'hover:bg-gray-100'}`}
                    >
                      {unit ? (
                        <div className="flex flex-col items-center justify-center h-full">
                          <span className={`font-bold text-xl ${isFull ? 'text-green-700' : 'text-orange-600'}`}>
                            {unit.filled_count}/{unit.quantity}
                          </span>
                          <span className="text-[10px] text-gray-600">{unit.role}</span>
                        </div>
                      ) : <PlusCircle className="mx-auto w-6 h-6 opacity-0 hover:opacity-40 text-gray-400" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- MODAL 2: שיבוץ כוח אדם --- */}
      {isUnitModalOpen && editingCell && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex overflow-hidden">

            {/* SIDEBAR */}
            <div className="w-1/3 bg-gray-50 border-l p-6 flex flex-col gap-6">
              <div>
                <h3 className="font-bold text-lg text-gray-800 mb-1">{editingCell.client.name}</h3>
                <p className="text-sm text-gray-500">{new Date(editingCell.date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              </div>

              {/* SETTINGS FORM */}
              <div className="space-y-3 bg-white p-4 rounded-lg border shadow-sm">
                <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">תפקיד</label>
                   <select className="w-full border-b py-1 bg-transparent font-medium outline-none" value={unitFormData.role} onChange={(e) => setUnitFormData({...unitFormData, role: e.target.value})}>
                     <option>מלצרים</option><option>טבחים</option><option>חדרניות</option>
                   </select>
                </div>
                <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">כמות נדרשת</label>
                   <input type="number" className="w-full border-b py-1 bg-transparent font-medium outline-none" value={unitFormData.quantity} onChange={(e) => setUnitFormData({...unitFormData, quantity: Number(e.target.value)})}/>
                </div>
                <button onClick={handleSaveUnitSettings} className="w-full mt-2 py-1.5 bg-gray-800 text-white text-sm rounded hover:bg-black">עדכן דרישה</button>
              </div>

              {/* EXCEL UPLOAD (NEW!) */}
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <label className="text-xs font-bold text-green-700 uppercase mb-2 block">קליטה קיבוצית (אקסל)</label>
                <p className="text-[10px] text-green-600 mb-2">פורמט: שם מלא (עמודה A), טלפון (עמודה B)</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700 flex items-center justify-center gap-2 text-sm font-bold shadow-sm"
                  >
                    {importing ? 'טוען...' : <><FileSpreadsheet size={16} /> טען קובץ</>}
                  </button>
                  <input type="file" ref={fileInputRef} hidden accept=".xlsx,.xls" onChange={handleExcelUpload} />
                </div>
              </div>

              {/* SEARCH */}
              <div className="flex-1 flex flex-col mt-2">
                <label className="text-xs font-bold text-gray-500 uppercase mb-2">חיפוש פרטני</label>
                <div className="relative">
                  <Search className="absolute right-3 top-2.5 text-gray-400" size={16} />
                  <input type="text" placeholder="חפש שם..." className="w-full pl-3 pr-9 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-purple-500" value={workerSearchTerm} onChange={(e) => setWorkerSearchTerm(e.target.value)} />
                </div>
                <div className="mt-2 flex-1 overflow-y-auto space-y-2">
                  {searchResults.map(worker => (
                    <div key={worker.id} className="flex justify-between items-center p-3 bg-white border rounded-lg hover:border-purple-300 shadow-sm">
                      <div><div className="font-bold text-sm">{worker.full_name}</div><div className="text-xs text-gray-500">{worker.phone}</div></div>
                      <button onClick={() => handleAssignWorker(worker)} className="bg-purple-50 text-purple-700 p-1.5 rounded-full hover:bg-purple-600 hover:text-white"><UserPlus size={18} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="w-2/3 p-6 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-xl">משובצים ({assignedWorkers.length}/{unitFormData.quantity})</h3>
                <button onClick={() => setIsUnitModalOpen(false)} className="hover:bg-gray-100 p-2 rounded-full"><X size={24}/></button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-right">
                  <thead className="text-xs text-gray-400 border-b"><tr><th className="pb-2">שם</th><th className="pb-2">טלפון</th><th className="pb-2">סטטוס</th><th className="pb-2">פעולות</th></tr></thead>
                  <tbody className="divide-y">
                    {assignedWorkers.map((assignment) => (
                      <tr key={assignment.id} className="group hover:bg-gray-50">
                        <td className="py-3 font-medium">{assignment.workers?.full_name}</td>
                        <td className="py-3 text-sm text-gray-500">{assignment.workers?.phone}</td>
                        <td className="py-3"><StatusBadge status={assignment.status} onClick={() => {
                            const next = assignment.status === 'Matched' ? 'Assigned' : assignment.status === 'Assigned' ? 'Confirmed' : assignment.status === 'Confirmed' ? 'Arrived' : 'Matched';
                            handleStatusChange(assignment.id, next);
                        }} /></td>
                        <td className="py-3"><button onClick={() => { if(confirm('למחוק?')) supabase.from('campaign_assignments').delete().eq('id', assignment.id).then(() => fetchAssignedWorkers(editingCell.id)); }} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                    {assignedWorkers.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-gray-400">השתמש בייבוא אקסל או בחיפוש להוספת עובדים</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Modal לקמפיין */}
      {isCampModalOpen && (
         <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg w-full max-w-md">
                <h3 className="text-lg font-bold mb-4">ניהול פרויקט</h3>
                <input className="w-full border p-2 mb-2 rounded" placeholder="שם" value={campFormData.name} onChange={e => setCampFormData({...campFormData, name: e.target.value})} />
                <div className="flex gap-2 mb-4">
                    <input type="date" className="w-full border p-2 rounded" value={campFormData.start_date} onChange={e => setCampFormData({...campFormData, start_date: e.target.value})} />
                    <input type="date" className="w-full border p-2 rounded" value={campFormData.end_date} onChange={e => setCampFormData({...campFormData, end_date: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2">
                    <button onClick={() => setIsCampModalOpen(false)} className="text-gray-500">ביטול</button>
                    <button onClick={async () => {
                        setLoading(true);
                        if(selectedCampaign) await supabase.from('campaigns').update(campFormData).eq('id', selectedCampaign.id);
                        else await supabase.from('campaigns').insert([campFormData]);
                        window.location.reload();
                    }} className="bg-purple-600 text-white px-4 py-2 rounded">{loading ? '...' : 'שמור'}</button>
                </div>
            </div>
         </div>
      )}
    </div>
  );
}
