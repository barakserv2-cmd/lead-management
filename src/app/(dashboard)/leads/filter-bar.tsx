"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ALL_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  type LeadStatusValue,
} from "@/lib/stateMachine";
import { SUB_STATUSES } from "@/lib/constants";

// Sub-statuses (flattened, labelled with their parent status).
const SUB_STATUS_OPTIONS = Object.entries(SUB_STATUSES).flatMap(([status, subs]) =>
  subs.map((sub) => ({ value: sub, label: sub, parent: STATUS_LABELS[status as LeadStatusValue] ?? status }))
);

const STATUS_OPTIONS = ALL_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
  dot: STATUS_COLORS[value].dot,
}));

// YYYY-MM-DD for a Date in Israel time (en-CA formats as YYYY-MM-DD).
function ilDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function monthRange(y: number, m: number): { from: string; to: string } {
  const mm = String(m).padStart(2, "0");
  const lastDay = new Date(y, m, 0).getDate(); // last calendar day of month m
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

function datePresets(): { label: string; from: string; to: string }[] {
  const DAY = 86_400_000;
  const now = Date.now();
  const today = ilDateStr(new Date(now));
  const yesterday = ilDateStr(new Date(now - DAY));
  const weekAgo = ilDateStr(new Date(now - 6 * DAY));
  const [ty, tm] = today.split("-").map(Number);
  const cur = monthRange(ty, tm);
  const prev = monthRange(tm === 1 ? ty - 1 : ty, tm === 1 ? 12 : tm - 1);
  return [
    { label: "היום", from: today, to: today },
    { label: "אתמול", from: yesterday, to: yesterday },
    { label: "7 ימים", from: weekAgo, to: today },
    { label: "חודש נוכחי", from: cur.from, to: cur.to },
    { label: "חודש קודם", from: prev.from, to: prev.to },
  ];
}

function FilterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  renderOption,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  renderOption?: (opt: { value: string; label: string }, isSelected: boolean) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:border-gray-400 ${
          selected.size > 0
            ? "border-cyan-300 bg-cyan-50 text-cyan-700"
            : "border-gray-200 bg-white text-gray-600"
        }`}
      >
        <FilterIcon />
        {label}
        {selected.size > 0 && (
          <span className="bg-cyan-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {selected.size}
          </span>
        )}
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 right-0 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in max-h-72 overflow-y-auto">
          {options.map((opt) => {
            const isSelected = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-right hover:bg-gray-50 transition-colors ${isSelected ? "bg-cyan-50/60" : ""}`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-cyan-600 border-cyan-600" : "border-gray-300"}`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                {renderOption ? renderOption(opt, isSelected) : opt.label}
              </button>
            );
          })}
          {selected.size > 0 && (
            <div className="border-t mt-1 pt-1 px-3 pb-1">
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="text-[10px] text-gray-500 hover:text-red-600 transition-colors"
              >
                נקה הכל
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FilterBar({
  allTags,
  recruiters = [],
  statusCounts = {},
  totalCount,
}: {
  allTags: string[];
  recruiters?: { email: string; name: string; count?: number }[];
  /** per-status lead counts under the current filters (excluding status) */
  statusCounts?: Record<string, number>;
  /** total leads matching ALL current filters — shown as a results chip */
  totalCount?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialStatuses = searchParams.get("statuses")?.split(",").filter(Boolean) ?? [];
  const initialTags = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
  const initialSubs = searchParams.get("sub")?.split(",").filter(Boolean) ?? [];
  const initialHandlers = searchParams.get("handler")?.split(",").filter(Boolean) ?? [];

  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(initialStatuses));
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set(initialTags));
  const [selectedSubs, setSelectedSubs] = useState<Set<string>>(new Set(initialSubs));
  const [selectedHandlers, setSelectedHandlers] = useState<Set<string>>(new Set(initialHandlers));
  const [dateFrom, setDateFrom] = useState<string>(searchParams.get("from") ?? "");
  const [dateTo, setDateTo] = useState<string>(searchParams.get("to") ?? "");

  // Sync from URL when searchParams change externally
  useEffect(() => {
    setSelectedStatuses(new Set(searchParams.get("statuses")?.split(",").filter(Boolean) ?? []));
    setSelectedTags(new Set(searchParams.get("tags")?.split(",").filter(Boolean) ?? []));
    setSelectedSubs(new Set(searchParams.get("sub")?.split(",").filter(Boolean) ?? []));
    setSelectedHandlers(new Set(searchParams.get("handler")?.split(",").filter(Boolean) ?? []));
    setDateFrom(searchParams.get("from") ?? "");
    setDateTo(searchParams.get("to") ?? "");
  }, [searchParams]);

  function applyDates(from: string, to: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (from) params.set("from", from); else params.delete("from");
    if (to) params.set("to", to); else params.delete("to");
    params.delete("page");
    router.push(`/leads?${params.toString()}`);
  }

  function applyFilters(
    statuses: Set<string>,
    tags: Set<string>,
    subs: Set<string> = selectedSubs,
    handlers: Set<string> = selectedHandlers
  ) {
    const params = new URLSearchParams(searchParams.toString());

    if (subs.size > 0) {
      params.set("sub", Array.from(subs).join(","));
    } else {
      params.delete("sub");
    }

    if (handlers.size > 0) {
      params.set("handler", Array.from(handlers).join(","));
    } else {
      params.delete("handler");
    }

    if (statuses.size > 0) {
      params.set("statuses", Array.from(statuses).join(","));
    } else {
      params.delete("statuses");
    }

    if (tags.size > 0) {
      params.set("tags", Array.from(tags).join(","));
    } else {
      params.delete("tags");
    }

    // Reset to page 1 on filter change
    params.delete("page");
    router.push(`/leads?${params.toString()}`);
  }

  function handleStatusChange(next: Set<string>) {
    setSelectedStatuses(next);
    applyFilters(next, selectedTags);
  }

  function handleTagChange(next: Set<string>) {
    setSelectedTags(next);
    applyFilters(selectedStatuses, next);
  }

  function handleSubChange(next: Set<string>) {
    setSelectedSubs(next);
    applyFilters(selectedStatuses, selectedTags, next);
  }

  function removeSub(value: string) {
    const next = new Set(selectedSubs);
    next.delete(value);
    setSelectedSubs(next);
    applyFilters(selectedStatuses, selectedTags, next);
  }

  function handleHandlerChange(next: Set<string>) {
    setSelectedHandlers(next);
    applyFilters(selectedStatuses, selectedTags, selectedSubs, next);
  }

  function removeHandler(value: string) {
    const next = new Set(selectedHandlers);
    next.delete(value);
    setSelectedHandlers(next);
    applyFilters(selectedStatuses, selectedTags, selectedSubs, next);
  }

  function clearAll() {
    setSelectedStatuses(new Set());
    setSelectedTags(new Set());
    setSelectedSubs(new Set());
    setSelectedHandlers(new Set());
    setDateFrom("");
    setDateTo("");
    const params = new URLSearchParams(searchParams.toString());
    ["statuses", "sub", "tags", "handler", "from", "to", "page"].forEach((k) => params.delete(k));
    router.push(`/leads?${params.toString()}`);
  }

  // תור חיוג: מי שהכי מזמן לא דיברנו איתו קודם. כפתור-מתג, כדי שאפשר
  // יהיה לחזור בקליק אחד לסדר הרגיל (הליד החדש קודם).
  function toggleStaleSort() {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("sort") === "stale") params.delete("sort");
    else params.set("sort", "stale");
    params.delete("page");
    router.push(`/leads?${params.toString()}`);
  }

  function removeStatus(value: string) {
    const next = new Set(selectedStatuses);
    next.delete(value);
    setSelectedStatuses(next);
    applyFilters(next, selectedTags);
  }

  function removeTag(value: string) {
    const next = new Set(selectedTags);
    next.delete(value);
    setSelectedTags(next);
    applyFilters(selectedStatuses, next);
  }

  const statusOptions = STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }));
  const tagOptions = allTags.map((t) => ({ value: t, label: t }));
  // רכזות + "ללא שיוך" (לידים שאף רכזת עוד לא נגעה בהם)
  const handlerOptions = [
    ...recruiters.map((r) => ({ value: r.email, label: r.name })),
    { value: "__none__", label: "ללא שיוך" },
  ];
  const handlerLabel = (value: string) =>
    value === "__none__" ? "ללא שיוך" : recruiters.find((r) => r.email === value)?.name ?? value;

  const hasFilters = selectedStatuses.size > 0 || selectedSubs.size > 0 || selectedTags.size > 0 || selectedHandlers.size > 0 || !!dateFrom || !!dateTo;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        {/* מונה תוצאות — כמה לידים עונים על הסינון הנוכחי */}
        {typeof totalCount === "number" && (
          <span
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold tabular-nums ${
              hasFilters
                ? "bg-cyan-600 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
            title={hasFilters ? "מספר הלידים שעונים על הסינון" : "סך כל הלידים ברשימה"}
          >
            {totalCount.toLocaleString("he-IL")} לידים
          </span>
        )}

        <MultiSelectDropdown
          label="סינון לפי סטטוס"
          options={statusOptions}
          selected={selectedStatuses}
          onChange={handleStatusChange}
          renderOption={(opt) => {
            const statusDef = STATUS_OPTIONS.find((s) => s.value === opt.value);
            return (
              <span className="flex items-center gap-1.5 w-full">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDef?.dot ?? "bg-gray-400"}`} />
                {opt.label}
                <span className="mr-auto text-[10px] font-semibold text-gray-400 tabular-nums">
                  {statusCounts[opt.value] ?? 0}
                </span>
              </span>
            );
          }}
        />

        <MultiSelectDropdown
          label="סינון לפי תת-סטטוס"
          options={SUB_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selected={selectedSubs}
          onChange={handleSubChange}
          renderOption={(opt) => {
            const def = SUB_STATUS_OPTIONS.find((o) => o.value === opt.value);
            return (
              <span className="flex items-center justify-between gap-2 w-full">
                <span>{opt.label}</span>
                <span className="text-[10px] text-gray-400">{def?.parent}</span>
              </span>
            );
          }}
        />

        <MultiSelectDropdown
          label="סינון לפי רכזת"
          options={handlerOptions}
          selected={selectedHandlers}
          onChange={handleHandlerChange}
          renderOption={(opt) => {
            const r = recruiters.find((x) => x.email === opt.value);
            return (
              <span className="flex items-center gap-1.5 w-full">
                <span>{opt.label}</span>
                {r?.count != null && (
                  <span className="mr-auto text-[10px] font-semibold text-gray-400 tabular-nums">{r.count}</span>
                )}
              </span>
            );
          }}
        />

        {tagOptions.length > 0 && (
          <MultiSelectDropdown
            label="סינון לפי תגיות"
            options={tagOptions}
            selected={selectedTags}
            onChange={handleTagChange}
          />
        )}

        {/* Call queue: oldest contact first */}
        <button
          type="button"
          onClick={toggleStaleSort}
          title="מיין לפי מי שהכי מזמן לא יצרנו איתו קשר"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
            searchParams.get("sort") === "stale"
              ? "border-amber-400 bg-amber-500 text-white font-semibold"
              : "border-gray-200 bg-white text-gray-600 hover:border-amber-300"
          }`}
        >
          ⏱ הכי מזמן לא דיברנו
        </button>

        {/* Date search (by arrival date) */}
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs ${
          dateFrom || dateTo ? "border-cyan-300 bg-cyan-50 text-cyan-700" : "border-gray-200 bg-white text-gray-600"
        }`}>
          <span className="text-[11px] font-medium">תאריך:</span>
          <input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => { setDateFrom(e.target.value); applyDates(e.target.value, dateTo); }}
            className="bg-transparent text-xs outline-none w-[7.5rem] cursor-pointer"
            aria-label="מתאריך"
          />
          <span className="text-gray-400">–</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => { setDateTo(e.target.value); applyDates(dateFrom, e.target.value); }}
            className="bg-transparent text-xs outline-none w-[7.5rem] cursor-pointer"
            aria-label="עד תאריך"
          />
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setDateFrom(""); setDateTo(""); applyDates("", ""); }}
              className="hover:text-red-600 transition-colors"
              aria-label="נקה תאריך"
            >
              <XIcon />
            </button>
          )}
        </div>

        {/* Quick date presets */}
        {datePresets().map((p) => {
          const active = dateFrom === p.from && dateTo === p.to;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => { setDateFrom(p.from); setDateTo(p.to); applyDates(p.from, p.to); }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                active
                  ? "border-cyan-400 bg-cyan-600 text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-cyan-300"
              }`}
            >
              {p.label}
            </button>
          );
        })}

        {hasFilters && (
          <>
            <div className="h-5 w-px bg-gray-200 mx-1" />

            {Array.from(selectedStatuses).map((s) => {
              const statusDef = STATUS_OPTIONS.find((st) => st.value === s);
              return (
                <span key={`s-${s}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDef?.dot ?? "bg-gray-400"}`} />
                  {statusDef?.label ?? s}
                  <span className="font-bold tabular-nums">({(statusCounts[s] ?? 0).toLocaleString("he-IL")})</span>
                  <button type="button" onClick={() => removeStatus(s)} className="hover:text-red-600 transition-colors">
                    <XIcon />
                  </button>
                </span>
              );
            })}

            {Array.from(selectedSubs).map((s) => (
              <span key={`sub-${s}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-violet-50 text-violet-700 border border-violet-200">
                {s}
                <button type="button" onClick={() => removeSub(s)} className="hover:text-red-600 transition-colors">
                  <XIcon />
                </button>
              </span>
            ))}

            {Array.from(selectedHandlers).map((h) => (
              <span key={`h-${h}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                {handlerLabel(h)}
                <button type="button" onClick={() => removeHandler(h)} className="hover:text-red-600 transition-colors">
                  <XIcon />
                </button>
              </span>
            ))}

            {Array.from(selectedTags).map((t) => (
              <span key={`t-${t}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                {t}
                <button type="button" onClick={() => removeTag(t)} className="hover:text-red-600 transition-colors">
                  <XIcon />
                </button>
              </span>
            ))}

            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] text-gray-500 hover:text-red-600 transition-colors mr-1"
            >
              נקה הכל
            </button>
          </>
        )}
      </div>
    </div>
  );
}
