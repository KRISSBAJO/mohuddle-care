"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  GripVertical,
  LayoutGrid,
  ListChecks,
  Moon,
  Plus,
  Printer,
  Search,
  Sun,
  Sunset,
  Users,
  XCircle,
} from "lucide-react";
import { Select } from "@/components/app/Select";
import { cn } from "@/lib/cn";
import { addDays, fmt, label, zonedTime } from "@/lib/format";
import {
  analyzeWeek,
  counts,
  kindFor as kindOfPattern,
  compactRange,
  coverageKey,
  formatHours,
  isoWeekday,
  patternHours,
  requiredPatterns,
  scheduleCsv,
  shiftDay,
  shiftHours,
  shiftTimeRange,
  weekdayLabel,
  windowFor,
  type Issue,
  type SchedHome,
  type SchedShift,
  type SchedStaff,
  type ScheduleRules,
  type ShiftKind,
} from "@/lib/schedule";
import { copyWeek, moveShift } from "@/server/actions/schedule";
import { BulkAddDialog } from "./BulkAddDialog";
import { ShiftEditor, type EditorTarget } from "./ShiftEditor";

type View = "homes" | "staff" | "day";

type Props = {
  weekStart: string;
  days: string[];
  today: string;
  homes: SchedHome[];
  staff: SchedStaff[];
  former: { id: string; firstName: string; lastName: string }[];
  shifts: SchedShift[];
  rules: ScheduleRules;
  manager: boolean;
  myStaffId: string | null;
  initialView: View;
  initialDay: string;
  initialHome: string;
};

const KIND_STYLE: Record<ShiftKind, { card: string; dot: string; icon: typeof Sun }> = {
  day: { card: "border-l-brand bg-sky/50", dot: "bg-brand", icon: Sun },
  evening: { card: "border-l-plum bg-plum-soft/70", dot: "bg-plum", icon: Sunset },
  overnight: { card: "border-l-ink bg-raise/80", dot: "bg-ink", icon: Moon },
};

const FINAL = new Set(["completed", "missed"]);

export function Scheduler(props: Props) {
  const { weekStart, days, today, homes, staff, rules, manager, myStaffId } = props;
  const router = useRouter();
  const [shifts, setShifts] = useState(props.shifts);
  const [view, setView] = useState<View>(props.initialView);
  const [focusDay, setFocusDay] = useState(props.initialDay);
  const [homeFilter, setHomeFilter] = useState(props.initialHome);
  const [search, setSearch] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [panel, setPanel] = useState<"issues" | "team">("issues");
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const [dragging, setDragging] = useState<{ type: "shift" | "staff"; id: string } | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Fresh data from the server replaces local, optimistic changes.
  const [serverShifts, setServerShifts] = useState(props.shifts);
  if (serverShifts !== props.shifts) {
    setServerShifts(props.shifts);
    setShifts(props.shifts);
  }
  const nowMinute = useSyncExternalStore(subscribeMinute, currentMinute, () => null);

  // Keep the view, day and home in the address bar so a link or refresh opens the same screen.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("week", weekStart);
    const set = (key: string, value: string, fallback: string) => (value === fallback ? url.searchParams.delete(key) : url.searchParams.set(key, value));
    set("view", view, "homes");
    set("day", focusDay, days.includes(today) ? today : days[0]);
    set("home", homeFilter, "");
    window.history.replaceState(null, "", url);
  }, [view, focusDay, homeFilter, weekStart, days, today]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const person of [...staff, ...props.former]) map.set(person.id, `${person.firstName} ${person.lastName}`);
    return map;
  }, [staff, props.former]);
  const homeName = useMemo(() => new Map(homes.map(home => [home.id, home.name])), [homes]);
  const week = useMemo(() => ({ from: days[0], to: addDays(days[6], 1) }), [days]);
  const analysis = useMemo(() => analyzeWeek(shifts, staff, homes, days, rules, today), [shifts, staff, homes, days, rules, today]);
  const credentialShifts = analysis.credentialRisk;
  const weekShifts = useMemo(() => shifts.filter(shift => days.includes(shiftDay(shift))), [shifts, days]);

  const problem = useCallback(
    (shift: SchedShift) =>
      analysis.doubleBooked.has(shift.id) ||
      analysis.shortRest.has(shift.id) ||
      credentialShifts.has(shift.id) ||
      (!shift.staffId && counts(shift) && shiftDay(shift) >= today) ||
      Boolean(shift.staffId && analysis.overtime.has(shift.staffId)),
    [analysis, credentialShifts, today],
  );

  const term = search.trim().toLowerCase();
  const visible = useCallback(
    (shift: SchedShift) => {
      if (homeFilter && shift.homeId !== homeFilter) return false;
      if (onlyOpen && shift.staffId) return false;
      if (onlyMine && shift.staffId !== myStaffId) return false;
      if (onlyProblems && !problem(shift)) return false;
      if (term) {
        const who = shift.staffId ? names.get(shift.staffId) ?? "" : "open";
        if (!`${who} ${homeName.get(shift.homeId) ?? ""} ${shift.note}`.toLowerCase().includes(term)) return false;
      }
      return true;
    },
    [homeFilter, onlyOpen, onlyMine, onlyProblems, problem, term, names, homeName, myStaffId],
  );

  const stats = useMemo(() => {
    const live = weekShifts.filter(counts);
    const filled = live.filter(shift => shift.staffId).length;
    const hours = live.filter(shift => shift.staffId).reduce((sum, shift) => sum + shiftHours(shift), 0);
    const open = live.filter(shift => !shift.staffId && shiftDay(shift) >= today).length;
    const gaps = analysis.issues.filter(issue => issue.type === "coverage").length;
    const confirmed = live.filter(shift => shift.status === "confirmed" || shift.status === "completed").length;
    return { total: live.length, filled, hours, open, gaps, confirmed, fill: live.length ? Math.round((filled / live.length) * 100) : 100 };
  }, [weekShifts, analysis, today]);

  const notify = (text: string, tone: "good" | "bad" = "good") => setToast({ text, tone });
  const refresh = (message: string) => {
    notify(message);
    router.refresh();
  };

  /* Drag and drop: apply the change at once, then confirm with the server; undo it if refused. */
  const applyMove = (shiftId: string, change: { day?: string; homeId?: string; staffId?: string | null }, message: string) => {
    const before = shifts;
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift || FINAL.has(shift.status)) return;
    const moved: SchedShift = { ...shift };
    if (change.day && change.day !== shiftDay(shift)) {
      const offset = (Date.parse(`${change.day}T12:00:00Z`) - Date.parse(`${shiftDay(shift)}T12:00:00Z`));
      moved.startsAt = new Date(Date.parse(shift.startsAt) + offset).toISOString();
      moved.endsAt = new Date(Date.parse(shift.endsAt) + offset).toISOString();
    }
    if (change.homeId) moved.homeId = change.homeId;
    if (change.staffId !== undefined) {
      moved.staffId = change.staffId;
      moved.status = change.staffId ? "scheduled" : "open";
    }
    setShifts(current => current.map(s => (s.id === shiftId ? moved : s)));
    startTransition(async () => {
      const result = await moveShift({ shiftId, ...change });
      if (result.error) {
        setShifts(before);
        notify(result.error, "bad");
      } else refresh(message);
    });
  };

  const onDragStart = (event: React.DragEvent, type: "shift" | "staff", id: string) => {
    event.dataTransfer.setData("text/plain", `${type}:${id}`);
    event.dataTransfer.effectAllowed = "move";
    setDragging({ type, id });
  };
  const onDragEnd = () => {
    setDragging(null);
    setDropKey(null);
  };
  const dropProps = (key: string, accepts: ("shift" | "staff")[], onDrop: (type: "shift" | "staff", id: string) => void) =>
    manager
      ? {
          onDragOver: (event: React.DragEvent) => {
            if (!dragging || !accepts.includes(dragging.type)) return;
            event.preventDefault();
            event.stopPropagation();
            if (dropKey !== key) setDropKey(key);
          },
          onDragLeave: () => setDropKey(current => (current === key ? null : current)),
          onDrop: (event: React.DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const [type, id] = event.dataTransfer.getData("text/plain").split(":") as ["shift" | "staff", string];
            setDropKey(null);
            setDragging(null);
            if (type && id && accepts.includes(type)) onDrop(type, id);
          },
        }
      : {};

  const assignStaffToCell = (homeId: string, day: string, staffId: string) => {
    const target = shifts.find(s => s.homeId === homeId && shiftDay(s) === day && !s.staffId && counts(s));
    if (!target) return notify("No open shift there. Drop the person straight onto a shift.", "bad");
    applyMove(target.id, { staffId }, `${names.get(staffId)} assigned`);
  };

  const exportCsv = () => {
    const csv = scheduleCsv(weekShifts.filter(visible), homes, [...staff, ...props.former.map(p => ({ ...p, role: "", homeId: null, expiredCredentials: [] }))], rules.patterns);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `milestone-schedule-${weekStart}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const copyLastWeek = () => {
    if (!confirm(`Copy every shift from the week of ${fmt.day(addDays(weekStart, -7))} into this week? Shifts already here are kept and not duplicated.`)) return;
    startTransition(async () => {
      const result = await copyWeek(addDays(weekStart, -7), weekStart);
      if (result.error) return notify(result.error, "bad");
      const parts = [`Copied ${result.created} ${result.created === 1 ? "shift" : "shifts"}`];
      if (result.skipped) parts.push(`${result.skipped} already here`);
      if (result.unassigned) parts.push(`${result.unassigned} left open`);
      refresh(parts.join(". "));
    });
  };

  const openIssue = (issue: Issue) => {
    if (issue.shiftId) return setEditing({ shiftId: issue.shiftId });
    if (issue.type === "coverage" && issue.homeId && issue.day && manager) {
      return setEditing({ homeId: issue.homeId, day: issue.day, patternId: issue.patternId ?? null });
    }
    if (issue.staffId) {
      setView("staff");
      setSearch(names.get(issue.staffId) ?? "");
    }
  };

  const toggleChip = (text: string, on: boolean, set: (update: (value: boolean) => boolean) => void) => (
    <button type="button" aria-pressed={on} onClick={() => set(value => !value)} className={cn("chip", on ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink")}>
      {text}
    </button>
  );

  const shownHomes = homes.filter(home => !homeFilter || home.id === homeFilter);
  const isThisWeek = days.includes(today);

  /* ---------- pieces ---------- */

  const shiftCard = (shift: SchedShift, { showHome = false, showStaff = true }: { showHome?: boolean; showStaff?: boolean } = {}) => {
    const style = KIND_STYLE[shift.kind];
    const KindIcon = style.icon;
    const final = FINAL.has(shift.status);
    const draggable = manager && !final;
    const open = !shift.staffId;
    const double = analysis.doubleBooked.has(shift.id);
    const rest = analysis.shortRest.has(shift.id);
    const credential = credentialShifts.has(shift.id);
    const key = `card-${shift.id}`;
    return (
      <div
        key={shift.id}
        role="button"
        tabIndex={0}
        draggable={draggable}
        onDragStart={event => onDragStart(event, "shift", shift.id)}
        onDragEnd={onDragEnd}
        onClick={() => setEditing({ shiftId: shift.id })}
        onKeyDown={event => (event.key === "Enter" || event.key === " ") && (event.preventDefault(), setEditing({ shiftId: shift.id }))}
        {...dropProps(key, ["staff"], (_type, staffId) => applyMove(shift.id, { staffId }, `${names.get(staffId)} assigned`))}
        className={cn(
          "group relative cursor-pointer rounded-lg border border-l-4 px-2 py-1.5 text-left text-xs shadow-sm outline-none transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-brand",
          open ? "border-dashed border-flag/60 border-l-flag bg-flag-soft/50" : cn("border-line", style.card),
          shift.status === "missed" && "opacity-55",
          dragging?.type === "shift" && dragging.id === shift.id && "opacity-40",
          dropKey === key && "ring-2 ring-brand ring-offset-1",
          !visible(shift) && "hidden",
        )}
        aria-label={`${label("shiftKind", shift.kind)} shift ${shiftTimeRange(shift)}, ${open ? "open" : names.get(shift.staffId!) ?? "former staff"}`}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="flex items-center gap-1 whitespace-nowrap font-semibold text-ink/80">
            <KindIcon className="h-3 w-3" aria-hidden="true" />
            {compactRange(shift)}
          </span>
          <span className="flex items-center gap-0.5">
            {double && <XCircle className="h-3.5 w-3.5 text-flag" aria-label="Double-booked" />}
            {(rest || credential) && !double && <AlertTriangle className="h-3.5 w-3.5 text-[#b7791f]" aria-label="Has a warning" />}
            {shift.status === "confirmed" && <CheckCircle2 className="h-3.5 w-3.5 text-sage" aria-label="Confirmed" />}
            {shift.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5 text-brand" aria-label="Worked" />}
            {draggable && <GripVertical className="h-3 w-3 text-dim opacity-0 group-hover:opacity-100" aria-hidden="true" />}
          </span>
        </div>
        {showStaff && <p className={cn("mt-0.5 truncate font-semibold", open ? "text-flag" : "text-ink")}>{open ? "Open shift" : names.get(shift.staffId!) ?? "Former staff"}</p>}
        {showHome && <p className="truncate text-[11px] text-mute">{homeName.get(shift.homeId) ?? "Closed home"}</p>}
        {shift.status === "missed" && <p className="text-[10px] font-semibold uppercase text-flag">Missed</p>}
        {shift.note && <p className="truncate text-[10px] text-mute">{shift.note}</p>}
      </div>
    );
  };

  const dayHeader = (day: string) => (
    <div className={cn("px-2 py-2 text-center", day === today && "rounded-t-lg bg-brand text-white")}>
      <p className={cn("text-[11px] font-semibold uppercase tracking-wider", day === today ? "text-white/80" : "text-mute")}>{fmt.weekday(day)}</p>
      <p className="font-display text-lg font-bold leading-none">{Number(day.slice(8))}</p>
    </div>
  );

  /* ---------- views ---------- */

  const homesView = (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="sticky top-0 z-10 grid grid-cols-[148px_repeat(7,minmax(0,1fr))] border-b border-line bg-white">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Home</div>
          {days.map(day => <div key={day}>{dayHeader(day)}</div>)}
        </div>
        {shownHomes.map(home => {
          let need = 0;
          let have = 0;
          for (const day of days) for (const pattern of requiredPatterns(home, day, rules.patterns)) {
            const c = analysis.coverage.get(coverageKey(home.id, day, pattern.id));
            need += c?.required ?? 0;
            have += Math.min(c?.filled ?? 0, c?.required ?? 0);
          }
          const pct = need ? Math.round((have / need) * 100) : 100;
          return (
            <div key={home.id} className="grid grid-cols-[148px_repeat(7,minmax(0,1fr))] border-b border-line/70 last:border-b-0">
              <div className="border-r border-line/70 px-3 py-3">
                <p className="text-[13px] font-bold leading-tight">{home.name}</p>
                <p className="mt-0.5 text-[11px] text-mute">{label("homeType", home.type)}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel" title={`${pct}% of required shifts staffed`}>
                  <div className={cn("h-full rounded-full", !need ? "bg-transparent" : pct === 100 ? "bg-sage" : pct >= 80 ? "bg-accent" : "bg-flag")} style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-[10px] font-semibold text-mute">{need ? `${pct}% staffed` : "No set staffing"}</p>
              </div>
              {days.map(day => {
                const cell = shifts.filter(shift => shift.homeId === home.id && shiftDay(shift) === day).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
                // Patterns this home needs that day whose hours are not fully staffed yet.
                const missingPatterns =
                  day >= today ? requiredPatterns(home, day, rules.patterns).filter(pattern => (analysis.coverage.get(coverageKey(home.id, day, pattern.id))?.filled ?? 0) < rules.coverageMinimum) : [];
                const closedDay = !home.openDays.includes(isoWeekday(day));
                const key = `cell-${home.id}-${day}`;
                return (
                  <div
                    key={day}
                    {...dropProps(key, ["shift", "staff"], (type, id) =>
                      type === "shift" ? applyMove(id, { day, homeId: home.id }, `Moved to ${home.name}, ${weekdayLabel(day)}`) : assignStaffToCell(home.id, day, id),
                    )}
                    className={cn(
                      "group/cell min-h-[118px] space-y-1.5 border-r border-line/50 p-1.5 last:border-r-0",
                      day === today && "bg-sky/25",
                      (day < today || closedDay) && "bg-panel/40",
                      dropKey === key && "bg-sky/60 outline-dashed outline-2 -outline-offset-4 outline-brand",
                    )}
                  >
                    {cell.map(shift => shiftCard(shift))}
                    {manager &&
                      missingPatterns.map(pattern => (
                        <button
                          key={pattern.id}
                          type="button"
                          onClick={() => setEditing({ homeId: home.id, day, patternId: pattern.id })}
                          title={`${pattern.name} ${pattern.start}–${pattern.end} is not fully staffed`}
                          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-flag/50 px-2 py-1.5 text-[11px] font-semibold text-flag hover:bg-flag-soft/50"
                        >
                          <Plus className="h-3 w-3 shrink-0" /> <span className="truncate">{pattern.name}</span>
                        </button>
                      ))}
                    {manager && missingPatterns.length === 0 && day >= today && (
                      <button
                        type="button"
                        onClick={() => setEditing({ homeId: home.id, day, patternId: null })}
                        className="flex w-full items-center justify-center rounded-lg py-1 text-[11px] text-dim opacity-0 transition hover:bg-panel hover:text-mute focus:opacity-100 group-hover/cell:opacity-100"
                        aria-label={`Add another shift at ${home.name} on ${weekdayLabel(day)}`}
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {shownHomes.length === 0 && <p className="px-5 py-10 text-center text-sm text-mute">No homes to show.</p>}
      </div>
    </div>
  );

  const rows: { id: string | null; name: string; person?: SchedStaff }[] = [
    { id: null, name: "Open shifts" },
    ...staff
      .filter(person => !onlyMine || person.id === myStaffId)
      .filter(person => !term || `${person.firstName} ${person.lastName}`.toLowerCase().includes(term))
      .map(person => ({ id: person.id, name: `${person.firstName} ${person.lastName}`, person })),
  ];

  const staffView = (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="sticky top-0 z-10 grid grid-cols-[168px_repeat(7,minmax(0,1fr))] border-b border-line bg-white">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-mute">Person · hours</div>
          {days.map(day => <div key={day}>{dayHeader(day)}</div>)}
        </div>
        {rows.map(row => {
          const hours = row.id ? analysis.hours.get(row.id) ?? 0 : 0;
          const over = row.id ? analysis.overtime.has(row.id) : false;
          return (
            <div key={row.id ?? "open"} className={cn("grid grid-cols-[168px_repeat(7,minmax(0,1fr))] border-b border-line/70", !row.id && "bg-flag-soft/20")}>
              <div
                className="flex items-center gap-2 border-r border-line/70 px-3 py-2"
                draggable={manager && Boolean(row.id)}
                onDragStart={event => row.id && onDragStart(event, "staff", row.id)}
                onDragEnd={onDragEnd}
              >
                {row.id ? (
                  <>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky font-display text-xs font-bold text-brand-deep">
                      {row.person!.firstName[0]}{row.person!.lastName[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{row.name}</span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-panel">
                        <span className={cn("block h-full rounded-full", over ? "bg-flag" : "bg-brand")} style={{ width: `${Math.min(100, (hours / rules.overtimeHours) * 100)}%` }} />
                      </span>
                      <span className={cn("mt-0.5 block text-[10px] font-semibold", over ? "text-flag" : "text-mute")}>
                        {formatHours(hours)} of {rules.overtimeHours}h{row.person!.expiredCredentials.length ? " · credential expired" : ""}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-bold text-flag">Open shifts</span>
                )}
              </div>
              {days.map(day => {
                const cell = shifts
                  .filter(shift => shift.staffId === row.id && shiftDay(shift) === day && (!homeFilter || shift.homeId === homeFilter))
                  .filter(shift => row.id || counts(shift))
                  .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
                const key = `srow-${row.id ?? "open"}-${day}`;
                return (
                  <div
                    key={day}
                    {...dropProps(key, ["shift"], (_type, id) => applyMove(id, { day, staffId: row.id }, row.id ? `Given to ${row.name}` : "Shift opened up"))}
                    className={cn(
                      "min-h-[64px] space-y-1 border-r border-line/50 p-1.5 last:border-r-0",
                      day === today && "bg-sky/25",
                      dropKey === key && "bg-sky/60 outline-dashed outline-2 -outline-offset-4 outline-brand",
                    )}
                  >
                    {cell.map(shift => shiftCard(shift, { showHome: true, showStaff: false }))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  const dayView = (() => {
    const start = zonedTime(focusDay, "00:00").getTime();
    const end = zonedTime(addDays(focusDay, 1), "00:00").getTime();
    const span = end - start;
    const nowPct = nowMinute !== null && isThisWeek && focusDay === today ? ((nowMinute * 60_000 - start) / span) * 100 : null;
    return (
      <div className="overflow-x-auto">
        <div className="min-w-[860px] p-4">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {days.map(day => (
              <button key={day} type="button" onClick={() => setFocusDay(day)} className={cn("chip", day === focusDay ? "bg-ink text-white" : "bg-panel text-mute hover:text-ink")}>
                {weekdayLabel(day)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[170px_1fr] text-[10px] font-semibold text-mute">
            <div />
            <div className="relative h-5">
              {Array.from({ length: 13 }, (_, i) => i * 2).map(hour => (
                <span key={hour} className="absolute -translate-x-1/2" style={{ left: `${(hour / 24) * 100}%` }}>
                  {hour === 24 ? "" : hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`}
                </span>
              ))}
            </div>
          </div>
          {shownHomes.map(home => {
            const here = shifts.filter(shift => shift.homeId === home.id && Date.parse(shift.startsAt) < end && Date.parse(shift.endsAt) > start && visible(shift));
            const lanes: SchedShift[][] = [];
            for (const shift of [...here].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
              const lane = lanes.find(l => Date.parse(l[l.length - 1].endsAt) <= Date.parse(shift.startsAt));
              if (lane) lane.push(shift);
              else lanes.push([shift]);
            }
            const needed = requiredPatterns(home, focusDay, rules.patterns);
            const missing = focusDay >= today ? needed.filter(pattern => (analysis.coverage.get(coverageKey(home.id, focusDay, pattern.id))?.filled ?? 0) < rules.coverageMinimum) : [];
            return (
              <div key={home.id} className="grid grid-cols-[170px_1fr] border-t border-line/70">
                <div className="py-2 pr-3">
                  <p className="text-sm font-bold">{home.name}</p>
                  {missing.length > 0 ? (
                    <p className="text-[11px] font-semibold text-flag">Needs {missing.map(pattern => pattern.name).join(", ")}</p>
                  ) : needed.length ? (
                    <p className="text-[11px] text-sage">Covered</p>
                  ) : (
                    <p className="text-[11px] text-mute">No set staffing</p>
                  )}
                </div>
                <div className="relative py-2" style={{ minHeight: `${Math.max(1, lanes.length) * 34 + 16}px` }}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <span key={i} className="absolute inset-y-0 border-l border-line/50" style={{ left: `${(i * 2 / 24) * 100}%` }} aria-hidden="true" />
                  ))}
                  {nowPct !== null && nowPct >= 0 && nowPct <= 100 && <span className="absolute inset-y-0 z-10 w-0.5 bg-flag" style={{ left: `${nowPct}%` }} aria-label="Now" />}
                  {lanes.map((lane, laneIndex) =>
                    lane.map(shift => {
                      const left = Math.max(0, (Date.parse(shift.startsAt) - start) / span) * 100;
                      const right = Math.min(1, (Date.parse(shift.endsAt) - start) / span) * 100;
                      const open = !shift.staffId;
                      return (
                        <button
                          key={shift.id}
                          type="button"
                          onClick={() => setEditing({ shiftId: shift.id })}
                          className={cn(
                            "absolute flex h-[30px] items-center gap-1.5 overflow-hidden rounded-md border border-l-4 px-2 text-left text-[11px] shadow-sm hover:shadow-md",
                            open ? "border-dashed border-flag/60 border-l-flag bg-flag-soft/70 text-flag" : cn("border-line", KIND_STYLE[shift.kind].card),
                            analysis.doubleBooked.has(shift.id) && "ring-2 ring-flag",
                          )}
                          style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%`, top: `${8 + laneIndex * 34}px` }}
                          title={`${shiftTimeRange(shift)} · ${open ? "Open" : names.get(shift.staffId!) ?? "Former staff"}`}
                        >
                          <span className="truncate font-semibold">{open ? "Open" : names.get(shift.staffId!) ?? "Former staff"}</span>
                          <span className="shrink-0 text-mute">{shiftTimeRange(shift)}</span>
                        </button>
                      );
                    }),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  const severityStyle = { high: "border-flag/40 bg-flag-soft/50", medium: "border-accent/50 bg-accent-soft/50", low: "border-line bg-panel" } as const;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="eyebrow">Schedule</p>
          <h1 className="mt-1 text-3xl font-bold">
            {fmt.day(days[0])} – {fmt.day(days[6])}
            {isThisWeek && <span className="ml-3 align-middle text-sm font-semibold text-brand">This week</span>}
          </h1>
          <p className="mt-1.5 text-sm text-mute">Click a shift to change it. {manager ? "Drag shifts between days or people, or drag a person onto a shift." : "Confirm your own shifts so the office knows you are on."}</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-full border border-line bg-white p-0.5">
            <Link href={`/app/schedule?week=${addDays(weekStart, -7)}&view=${view}`} className="rounded-full p-2 hover:bg-panel" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Link>
            <Link href={`/app/schedule?view=${view}`} className="rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-panel">Today</Link>
            <Link href={`/app/schedule?week=${addDays(weekStart, 7)}&view=${view}`} className="rounded-full p-2 hover:bg-panel" aria-label="Next week"><ChevronRight className="h-4 w-4" /></Link>
          </div>
          <label className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-mute">
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="sr-only">Jump to a date</span>
            <input
              type="date"
              className="bg-transparent text-xs outline-none"
              defaultValue={weekStart}
              onChange={event => event.target.value && router.push(`/app/schedule?week=${event.target.value}&view=${view}`)}
            />
          </label>
          {manager && (
            <>
              <button type="button" className="btn-ghost btn-sm" onClick={copyLastWeek}><Copy className="h-4 w-4" /> Copy last week</button>
              <button type="button" className="btn-brand btn-sm" onClick={() => setBulkOpen(true)}><Plus className="h-4 w-4" /> Add shifts</button>
            </>
          )}
          <button type="button" className="btn-ghost btn-sm" onClick={exportCsv} title="Download this week as a spreadsheet"><Download className="h-4 w-4" /> CSV</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => window.print()} title="Print this week"><Printer className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          { title: "Shifts", value: String(stats.total), hint: `${stats.confirmed} confirmed`, tone: "" },
          { title: "Staffed", value: `${stats.fill}%`, hint: `${stats.filled} of ${stats.total} filled`, tone: stats.fill === 100 ? "text-sage" : stats.fill >= 85 ? "text-[#8a5a10]" : "text-flag" },
          { title: "Open shifts", value: String(stats.open), hint: "From today on", tone: stats.open ? "text-flag" : "text-sage", onClick: () => setOnlyOpen(v => !v) },
          { title: "Coverage gaps", value: String(stats.gaps), hint: `Below ${rules.coverageMinimum} per shift`, tone: stats.gaps ? "text-flag" : "text-sage", onClick: () => setPanel("issues") },
          { title: "Hours", value: formatHours(stats.hours), hint: "Scheduled this week", tone: "" },
          { title: "Problems", value: String(analysis.issues.length), hint: "Clashes, rest, overtime", tone: analysis.issues.length ? "text-[#8a5a10]" : "text-sage", onClick: () => setOnlyProblems(v => !v) },
        ].map(card => {
          const body = (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-mute">{card.title}</p>
              <p className={cn("mt-1 font-display text-2xl font-bold", card.tone)}>{card.value}</p>
              <p className="text-[11px] text-mute">{card.hint}</p>
            </>
          );
          return card.onClick ? (
            <button key={card.title} type="button" onClick={card.onClick} className="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]">{body}</button>
          ) : (
            <div key={card.title} className="card p-4">{body}</div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="no-print card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex rounded-xl bg-panel p-1" role="tablist" aria-label="Schedule view">
          {([
            ["homes", "Homes", LayoutGrid],
            ["staff", "Staff", Users],
            ["day", "Day timeline", Clock],
          ] as const).map(([value, text, Icon]) => (
            <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition", view === value ? "bg-white text-ink shadow-sm" : "text-mute hover:text-ink")}>
              <Icon className="h-4 w-4" /> {text}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-mute" aria-hidden="true" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a person, home or note" aria-label="Find a person, home or note" className="field w-full py-2 pl-9 sm:w-60" />
          </div>
          <Select value={homeFilter} onChange={value => setHomeFilter(value)} aria-label="Filter by home" searchable emptyLabel="All homes" className="w-full sm:w-auto" options={homes.map(home => ({ value: home.id, label: home.name }))} />
          <div className="flex flex-wrap gap-1.5">
            {toggleChip("Open only", onlyOpen, setOnlyOpen)}
            {toggleChip("Problems", onlyProblems, setOnlyProblems)}
            {myStaffId && toggleChip("My shifts", onlyMine, setOnlyMine)}
          </div>
        </div>
      </div>

      <div className="grid gap-5 min-[1700px]:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card overflow-hidden" aria-label="Schedule">
          {view === "homes" ? homesView : view === "staff" ? staffView : dayView}
          <div className="no-print flex flex-wrap items-center gap-4 border-t border-line px-4 py-2.5 text-[11px] text-mute">
            {rules.patterns.map(pattern => (
              <span key={pattern.id} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-sm", KIND_STYLE[kindOfPattern(pattern.start)].dot)} /> {pattern.name} {compactRange(windowFor("2026-01-05", patternHours(pattern)))}
              </span>
            ))}
            {manager && <Link href="/app/settings/shifts" className="font-semibold text-brand hover:text-brand-deep">Edit shift patterns</Link>}
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-flag" /> Open</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-sage" /> Confirmed</span>
            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-flag" /> Double-booked</span>
            <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-[#b7791f]" /> Warning</span>
          </div>
        </section>

        <aside className="no-print space-y-3">
          <div className="flex rounded-xl bg-panel p-1">
            <button type="button" onClick={() => setPanel("issues")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", panel === "issues" ? "bg-white shadow-sm" : "text-mute")}>
              <ListChecks className="h-4 w-4" /> Issues <span className={cn("chip px-1.5 py-0", analysis.issues.length ? "bg-flag-soft text-flag" : "bg-sage-soft text-sage")}>{analysis.issues.length}</span>
            </button>
            <button type="button" onClick={() => setPanel("team")} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", panel === "team" ? "bg-white shadow-sm" : "text-mute")}>
              <Users className="h-4 w-4" /> Team
            </button>
          </div>
          {panel === "issues" ? (
            <div className="card max-h-[640px] space-y-2 overflow-y-auto p-3">
              {analysis.issues.length === 0 ? (
                <div className="px-2 py-8 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-sage" />
                  <p className="mt-2 text-sm font-semibold">Nothing needs attention</p>
                  <p className="text-xs text-mute">Every shift is covered, nobody is double-booked or over hours.</p>
                </div>
              ) : (
                analysis.issues.map(issue => (
                  <button key={issue.key} type="button" onClick={() => openIssue(issue)} className={cn("w-full rounded-xl border px-3 py-2 text-left text-xs transition hover:shadow-sm", severityStyle[issue.severity])}>
                    <span className="flex items-start gap-2">
                      {issue.severity === "high" ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-flag" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b7791f]" />}
                      <span>
                        <span className="block font-semibold text-ink">{issue.text}</span>
                        <span className="text-mute">
                          {{ double: "Double-booked", coverage: "Coverage gap", rest: "Short rest", overtime: "Overtime", credential: "Credential" }[issue.type]}
                          {manager && (issue.shiftId || issue.type === "coverage") ? " · click to fix" : ""}
                        </span>
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="card max-h-[640px] overflow-y-auto p-3">
              {manager && <p className="mb-2 px-1 text-[11px] text-mute">Drag a person onto a shift, or onto a day in a home with an open shift.</p>}
              <ul className="space-y-1.5">
                {staff
                  .filter(person => !term || `${person.firstName} ${person.lastName}`.toLowerCase().includes(term))
                  .map(person => {
                    const hours = analysis.hours.get(person.id) ?? 0;
                    const over = analysis.overtime.has(person.id);
                    return (
                      <li
                        key={person.id}
                        draggable={manager}
                        onDragStart={event => onDragStart(event, "staff", person.id)}
                        onDragEnd={onDragEnd}
                        className={cn("flex items-center gap-2 rounded-xl border border-line bg-white px-2.5 py-2", manager && "cursor-grab active:cursor-grabbing", dragging?.type === "staff" && dragging.id === person.id && "opacity-50")}
                      >
                        {manager && <GripVertical className="h-4 w-4 shrink-0 text-dim" aria-hidden="true" />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">{person.firstName} {person.lastName}</span>
                            <span className={cn("text-[11px] font-semibold", over ? "text-flag" : "text-mute")}>{formatHours(hours)}</span>
                          </span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-panel">
                            <span className={cn("block h-full rounded-full", over ? "bg-flag" : hours / rules.overtimeHours > 0.85 ? "bg-accent" : "bg-brand")} style={{ width: `${Math.min(100, (hours / rules.overtimeHours) * 100)}%` }} />
                          </span>
                          <span className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-mute">
                            {homeName.get(person.homeId ?? "") ?? "Floating"}
                            {person.expiredCredentials.length > 0 && <span className="font-semibold text-flag">· {person.expiredCredentials.join(", ")} expired</span>}
                          </span>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {editing && (
        <ShiftEditor
          key={"shiftId" in editing ? editing.shiftId : `${editing.homeId}-${editing.day}-${editing.patternId}`}
          target={editing}
          shifts={shifts}
          homes={homes}
          staff={staff}
          names={names}
          rules={rules}
          week={week}
          manager={manager}
          myStaffId={myStaffId}
          onClose={() => setEditing(null)}
          onDone={refresh}
        />
      )}
      {bulkOpen && <BulkAddDialog homes={homes} staff={staff} shifts={shifts} days={days} today={today} rules={rules} onClose={() => setBulkOpen(false)} onDone={refresh} />}

      <div aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
        {toast && (
          <p className={cn("pointer-events-auto rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-float)]", toast.tone === "good" ? "bg-ink" : "bg-flag")}>{toast.text}</p>
        )}
      </div>
    </div>
  );
}

/* A clock for the "now" line on the timeline, ticking once a minute. */
function subscribeMinute(onChange: () => void) {
  const timer = setInterval(onChange, 30_000);
  return () => clearInterval(timer);
}
const currentMinute = () => Math.floor(Date.now() / 60_000);
