'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Calendar, PlusCircle, X, Upload, Phone,
  MessageCircle, ExternalLink, Users, Building2,
  ChevronDown, ChevronLeft, Trash2,
} from 'lucide-react';
import { BulkImportDialog } from '../leads/bulk-import-dialog';
import { nukeAllExtrasLeads } from '../leads/actions';
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/stateMachine';
import type { LeadStatusValue } from '@/lib/stateMachine';

// ── Types ──────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface ScheduleLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: LeadStatusValue;
  job_title: string | null;
  hired_client: string;
  arrival_date: string;
}

// ── Helpers ────────────────────────────────────────────────

/** Format a raw date string (YYYY-MM-DD or anything) for display. */
function formatDate(raw: string): string {
  if (!raw) return raw;
  // Try YYYY-MM-DD → DD.MM.YYYY
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  // Fallback: show as-is
  return raw;
}

function formatDateWithDay(raw: string): string {
  if (!raw) return raw;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const DAYS = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];
    const dt = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3], 12));
    const dayName = DAYS[dt.getUTCDay()];
    return `${dayName}, ${iso[3]}.${iso[2]}.${iso[1]}`;
  }
  return raw;
}

// ── Grouped data structures ────────────────────────────────

interface DateGroup {
  date: string;
  leads: ScheduleLead[];
}

interface EmployerGroup {
  employer: string;
  totalCount: number;
  dateGroups: DateGroup[];
}

function buildEmployerGroups(leads: ScheduleLead[]): EmployerGroup[] {
  // Group by employer
  const byEmployer = new Map<string, ScheduleLead[]>();
  for (const lead of leads) {
    const emp = lead.hired_client;
    if (!byEmployer.has(emp)) byEmployer.set(emp, []);
    byEmployer.get(emp)!.push(lead);
  }

  // Build groups sorted by employer name
  const groups: EmployerGroup[] = [];
  const sortedEmployers = Array.from(byEmployer.keys()).sort((a, b) => a.localeCompare(b, 'he'));

  for (const employer of sortedEmployers) {
    const employerLeads = byEmployer.get(employer)!;

    // Group by date within this employer
    const byDate = new Map<string, ScheduleLead[]>();
    for (const lead of employerLeads) {
      const d = lead.arrival_date;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(lead);
    }

    // Sort dates ascending
    const sortedDates = Array.from(byDate.keys()).sort();
    const dateGroups: DateGroup[] = sortedDates.map(date => ({
      date,
      leads: byDate.get(date)!.sort((a, b) => a.name.localeCompare(b.name, 'he')),
    }));

    groups.push({
      employer,
      totalCount: employerLeads.length,
      dateGroups,
    });
  }

  return groups;
}

// ── Component ──────────────────────────────────────────────

export default function ExtrasPage() {
  const supabase = createClient();

  // --- Data ---
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [scheduleLeads, setScheduleLeads] = useState<ScheduleLead[]>([]);

  // --- UI ---
  const [expandedEmployers, setExpandedEmployers] = useState<Set<string>>(new Set());
  const [isCampModalOpen, setIsCampModalOpen] = useState(false);
  const [campFormData, setCampFormData] = useState({ name: '', start_date: '', end_date: '' });
  const [loading, setLoading] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  // --- Init ---
  useEffect(() => { fetchCampaigns(); }, []);
  useEffect(() => { if (selectedCampaign) fetchScheduleLeads(); }, [selectedCampaign]);

  async function fetchCampaigns() {
    const { data: camps } = await supabase.from('campaigns').select('*').order('start_date', { ascending: false });
    if (camps && camps.length > 0) {
      setCampaigns(camps);
      if (!selectedCampaign) setSelectedCampaign(camps[0]);
    }
  }

  async function fetchScheduleLeads() {
    const { data } = await supabase
      .from('leads')
      .select('id, name, phone, email, status, job_title, hired_client, arrival_date')
      .not('hired_client', 'is', null)
      .not('arrival_date', 'is', null);

    const leads = (data ?? []) as ScheduleLead[];
    setScheduleLeads(leads);
    // Auto-expand all employers on fresh load
    setExpandedEmployers(new Set(leads.map(l => l.hired_client)));
  }

  // ── Grouped data ───────────────────────────────────────────

  const employerGroups = useMemo(() => buildEmployerGroups(scheduleLeads), [scheduleLeads]);

  function toggleEmployer(employer: string) {
    setExpandedEmployers(prev => {
      const next = new Set(prev);
      if (next.has(employer)) next.delete(employer);
      else next.add(employer);
      return next;
    });
  }

  function expandAll() {
    setExpandedEmployers(new Set(employerGroups.map(g => g.employer)));
  }

  function collapseAll() {
    setExpandedEmployers(new Set());
  }

  // ── Render ──────────────────────────────────────────────────

  if (!selectedCampaign) return <div className="p-10 text-center">טוען...</div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto dir-rtl font-sans text-gray-800">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <div className="bg-purple-100 p-3 rounded-full text-purple-600"><Calendar size={24} /></div>
          <div>
            <h1 className="text-2xl font-bold">{selectedCampaign.name}</h1>
            <p className="text-sm text-gray-500">
              {employerGroups.length} מעסיקים &middot; {scheduleLeads.length} עובדים
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={async () => {
            if (!confirm('פעולה זו תמחק לצמיתות את כל העובדים שיובאו מאקסל!\nהאם להמשיך?')) return;
            const res = await nukeAllExtrasLeads();
            if (res.error) { alert('שגיאה: ' + res.error); return; }
            alert(`${res.deleted} רשומות נמחקו בהצלחה. ניתן לייבא מחדש.`);
            fetchScheduleLeads();
          }} className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-bold hover:bg-red-700 flex items-center gap-1.5 border-2 border-red-800">
            <Trash2 size={16} /> מחיקת כל נתוני אקסטרות
          </button>
          <button onClick={() => setBulkImportOpen(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2">
            <Upload size={18} /> ייבוא מ-Excel
          </button>
          <button onClick={() => { setCampFormData({ name: '', start_date: '', end_date: '' }); setSelectedCampaign(null); setIsCampModalOpen(true); }} className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700 flex items-center gap-2">
            <PlusCircle size={18} /> פרויקט חדש
          </button>
          <select className="border rounded p-2 bg-gray-50" value={selectedCampaign.id} onChange={(e) => { const c = campaigns.find(x => x.id === e.target.value); if (c) setSelectedCampaign(c); }}>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* EXPAND/COLLAPSE CONTROLS */}
      {employerGroups.length > 0 && (
        <div className="flex gap-2 mb-4">
          <button onClick={expandAll} className="text-xs text-gray-500 hover:text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg font-medium">
            פתח הכל
          </button>
          <button onClick={collapseAll} className="text-xs text-gray-500 hover:text-gray-800 bg-gray-100 px-3 py-1.5 rounded-lg font-medium">
            סגור הכל
          </button>
        </div>
      )}

      {/* EMPLOYER CARDS */}
      {employerGroups.length === 0 && (
        <div className="bg-white rounded-xl shadow border border-gray-200 p-12 text-center">
          <Users size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-600 mb-2">אין עובדים עם תאריך הגעה</h3>
          <p className="text-sm text-gray-400">
            ייבא קובץ Excel עם עמודת &quot;תאריך הגעה&quot; כדי לאכלס את הלוח
          </p>
        </div>
      )}

      <div className="space-y-4">
        {employerGroups.map(group => {
          const isExpanded = expandedEmployers.has(group.employer);

          return (
            <div key={group.employer} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* ── Employer Header (clickable) ─── */}
              <button
                onClick={() => toggleEmployer(group.employer)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors text-right"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 size={20} className="text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{group.employer}</h2>
                    <p className="text-xs text-gray-500">
                      {group.totalCount} עובדים &middot; {group.dateGroups.length} תאריכים
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-emerald-100 text-emerald-700 text-sm font-bold px-3 py-1 rounded-full">
                    {group.totalCount}
                  </span>
                  {isExpanded
                    ? <ChevronDown size={20} className="text-gray-400" />
                    : <ChevronLeft size={20} className="text-gray-400" />
                  }
                </div>
              </button>

              {/* ── Expanded content ─── */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {group.dateGroups.map(dateGroup => (
                    <div key={dateGroup.date} className="border-b border-gray-50 last:border-b-0">
                      {/* Date sub-header */}
                      <div className="flex items-center gap-2 px-5 py-2.5 bg-gray-50/70">
                        <Calendar size={14} className="text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700">
                          {formatDateWithDay(dateGroup.date)}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({dateGroup.leads.length} עובדים)
                        </span>
                        {/* Show raw date for debugging */}
                        <span className="text-[10px] text-gray-300 mr-auto" dir="ltr">
                          {dateGroup.date}
                        </span>
                      </div>

                      {/* Workers table */}
                      <div className="px-5 py-2">
                        <table className="w-full">
                          <thead>
                            <tr className="text-xs text-gray-400">
                              <th className="text-right pb-1.5 font-medium w-[30%]">שם</th>
                              <th className="text-right pb-1.5 font-medium w-[20%]">טלפון</th>
                              <th className="text-right pb-1.5 font-medium w-[20%]">תפקיד</th>
                              <th className="text-right pb-1.5 font-medium w-[15%]">סטטוס</th>
                              <th className="text-right pb-1.5 font-medium w-[15%]">פעולות</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dateGroup.leads.map(lead => {
                              const colors = STATUS_COLORS[lead.status] ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
                              const label = STATUS_LABELS[lead.status] ?? lead.status;
                              return (
                                <tr key={lead.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                                  <td className="py-2.5">
                                    <a href={`/leads/${lead.id}`} className="font-medium text-sm text-gray-900 hover:text-purple-600">
                                      {lead.name}
                                    </a>
                                  </td>
                                  <td className="py-2.5 text-sm text-gray-600" dir="ltr">
                                    {lead.phone || '—'}
                                  </td>
                                  <td className="py-2.5 text-sm text-gray-500">
                                    {lead.job_title || '—'}
                                  </td>
                                  <td className="py-2.5">
                                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                                      {label}
                                    </span>
                                  </td>
                                  <td className="py-2.5">
                                    <div className="flex items-center gap-1.5">
                                      {lead.phone && (
                                        <>
                                          <a href={`tel:${lead.phone}`} className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50" title="התקשר">
                                            <Phone size={14} />
                                          </a>
                                          <a href={`https://wa.me/${lead.phone.replace(/^0/, '972')}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-green-500 hover:bg-green-50" title="WhatsApp">
                                            <MessageCircle size={14} />
                                          </a>
                                        </>
                                      )}
                                      <a href={`/leads/${lead.id}`} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" title="פרטים">
                                        <ExternalLink size={14} />
                                      </a>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Campaign Modal */}
      {isCampModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">ניהול פרויקט</h3>
            <input className="w-full border p-2 mb-2 rounded" placeholder="שם" value={campFormData.name} onChange={e => setCampFormData({ ...campFormData, name: e.target.value })} />
            <div className="flex gap-2 mb-4">
              <input type="date" className="w-full border p-2 rounded" value={campFormData.start_date} onChange={e => setCampFormData({ ...campFormData, start_date: e.target.value })} />
              <input type="date" className="w-full border p-2 rounded" value={campFormData.end_date} onChange={e => setCampFormData({ ...campFormData, end_date: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsCampModalOpen(false)} className="text-gray-500">ביטול</button>
              <button onClick={async () => {
                setLoading(true);
                if (selectedCampaign) await supabase.from('campaigns').update(campFormData).eq('id', selectedCampaign.id);
                else await supabase.from('campaigns').insert([campFormData]);
                window.location.reload();
              }} className="bg-purple-600 text-white px-4 py-2 rounded">{loading ? '...' : 'שמור'}</button>
            </div>
          </div>
        </div>
      )}

      <BulkImportDialog
        open={bulkImportOpen}
        onClose={() => { setBulkImportOpen(false); fetchScheduleLeads(); }}
        source="אקסטרות"
      />
    </div>
  );
}
