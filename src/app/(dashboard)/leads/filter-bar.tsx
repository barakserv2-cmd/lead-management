"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ALL_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  type LeadStatusValue,
} from "@/lib/stateMachine";

const STATUS_OPTIONS = ALL_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
  dot: STATUS_COLORS[value].dot,
}));

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

export function FilterBar({ allTags }: { allTags: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialStatuses = searchParams.get("statuses")?.split(",").filter(Boolean) ?? [];
  const initialTags = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];

  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set(initialStatuses));
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set(initialTags));

  // Sync from URL when searchParams change externally
  useEffect(() => {
    setSelectedStatuses(new Set(searchParams.get("statuses")?.split(",").filter(Boolean) ?? []));
    setSelectedTags(new Set(searchParams.get("tags")?.split(",").filter(Boolean) ?? []));
  }, [searchParams]);

  function applyFilters(statuses: Set<string>, tags: Set<string>) {
    const params = new URLSearchParams(searchParams.toString());

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

  function clearAll() {
    setSelectedStatuses(new Set());
    setSelectedTags(new Set());
    applyFilters(new Set(), new Set());
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

  const hasFilters = selectedStatuses.size > 0 || selectedTags.size > 0;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <MultiSelectDropdown
          label="סינון לפי סטטוס"
          options={statusOptions}
          selected={selectedStatuses}
          onChange={handleStatusChange}
          renderOption={(opt) => {
            const statusDef = STATUS_OPTIONS.find((s) => s.value === opt.value);
            return (
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDef?.dot ?? "bg-gray-400"}`} />
                {opt.label}
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

        {hasFilters && (
          <>
            <div className="h-5 w-px bg-gray-200 mx-1" />

            {Array.from(selectedStatuses).map((s) => {
              const statusDef = STATUS_OPTIONS.find((st) => st.value === s);
              return (
                <span key={`s-${s}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-cyan-50 text-cyan-700 border border-cyan-200">
                  <span className={`w-1.5 h-1.5 rounded-full ${statusDef?.dot ?? "bg-gray-400"}`} />
                  {statusDef?.label ?? s}
                  <button type="button" onClick={() => removeStatus(s)} className="hover:text-red-600 transition-colors">
                    <XIcon />
                  </button>
                </span>
              );
            })}

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
