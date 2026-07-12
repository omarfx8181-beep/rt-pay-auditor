import { useState, useMemo } from "react";
import { Plus, Trash2, Activity, FileCheck2, SlidersHorizontal, CalendarClock, TrendingUp, AlertTriangle, ScanLine, Loader2, X } from "lucide-react";

/* ================= helpers ================= */
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const r2 = (n) => Math.round(n * 100) / 100;
const $fmt = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hFmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isWeekend = (dateStr) => { const d = new Date(dateStr + "T12:00:00"); const g = d.getDay(); return g === 0 || g === 6; };
const dayLabel = (dateStr) => { const d = new Date(dateStr + "T12:00:00"); return isNaN(d) ? dateStr : d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }); };
let _id = 100; const uid = () => "s" + _id++;

/* ---- schedule scan (ScheduleAnywhere screenshots → shifts) ---- */
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec((t || "").trim()); return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : null; };
const schedHours = (start, end, cfg) => {
  const a = toMin(start), b = toMin(end);
  if (a === null || b === null) return null;
  let mins = b - a; if (mins <= 0) mins += 1440; // overnight shift
  let h = mins / 60;
  if (h > num(cfg.mealThreshold)) h -= num(cfg.mealDeduct);
  return r2(h);
};
const fileToB64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("Could not read " + file.name)); r.readAsDataURL(file); });

async function parseScheduleImages(files) {
  const imgs = [];
  for (const f of files) imgs.push({ type: "image", source: { type: "base64", media_type: f.type || "image/png", data: await fileToB64(f) } });
  const today = new Date().toISOString().slice(0, 10);
  const instruction =
    "You are extracting work shifts from screenshot(s) of a ScheduleAnywhere staff schedule (hospital scheduling software) belonging to one respiratory therapist. Today is " + today + ". " +
    "Dates in the image may omit the year - infer the year that places each date closest to today (schedules usually cover the current or upcoming weeks). " +
    'Extract every scheduled WORK shift. Respond with ONLY valid JSON, no markdown, no backticks, no commentary, using exactly this schema: {"shifts":[{"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","label":"unit or shift code, else empty string"}]} ' +
    'Rules: times in 24-hour format ("6:45a" -> "06:45", "7:15p" -> "19:15", "11:15p" -> "23:15"). ' +
    'If a cell shows a shift code without readable times, include it with "start":"" and "end":"" and put the code in label. ' +
    "Skip OFF days, PTO, requests, holidays, and blank cells. If multiple images are parts of the same schedule, combine them and de-duplicate by date.";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: [...imgs, { type: "text", text: instruction }] }] }),
  });
  const data = await response.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);
  if (!parsed || !Array.isArray(parsed.shifts)) throw new Error("No shifts found in the response.");
  return parsed.shifts;
}

/* ================= seed config (decoded from stub, PP 6/22–7/05) ================= */
const DEFAULT_CFG = {
  baseRate: "52.53",
  otMult: "1.5", dtMult: "2.0",
  otPeriod: "80",          // OT after 80 straight hrs / pay period
  dtDaily: "12",           // DT for hours over 12 in a day
  otRateOverride: "85.74", // FLSA blended OT rate calibrated from stub; blank = base × mult
  weekendDiff: "2.00", eveningDiff: "2.00",
  eveningHours: "18.45",   // period-level until the 301 rule is confirmed
  chargeRate: "3.00", premiumRate: "3.00", preceptorRate: "3.00",
  unit548: "50",
  imputed: "1.81",
  k403bPct: "3.0",
  med: "276.61", dent: "64.55", fsa: "76.92",
  fedEff: "13.6977", mnEff: "6.0205",        // calibrated effective W/H %
  marginalFed: "22", marginalMN: "6.8",      // used only for what-if deltas
  mnFam: "0.135", mnMed: "0.305",            // MN Paid Leave EE %
  acc: "6.12", crit: "5.19", otherAfterTax: "87.73",
  mealDeduct: "0.5", mealThreshold: "6",
};

const DEFAULT_TIERS = [
  { id: "t1", label: "Shift extension > 4 hr", units: 2 },
  { id: "t2", label: "Shift extension ≤ 4 hr (confirm)", units: 1 },
  { id: "t3", label: "12-hr extra shift ($500)", units: 10 },
  { id: "t4", label: "16-hr extra shift (current)", units: 8 },
  { id: "t5", label: "Transport run ≤ 4 hr", units: 1 },
  { id: "t6", label: "Transport run > 4 hr", units: 2 },
  { id: "t7", label: "4-hr extra — old tier ($125)", units: 2.5 },
  { id: "t8", label: "16-hr extra — old tier ($750)", units: 15 },
];

const DEMO_SHIFTS = [
  { id: uid(), date: "2026-06-23", hours: "15.60", charge: "0", premium: "12", preceptor: "0", units548: "2", note: "Ext > 4h" },
  { id: uid(), date: "2026-06-24", hours: "14.40", charge: "0", premium: "12", preceptor: "0", units548: "4", note: "Ext + transport" },
  { id: uid(), date: "2026-06-25", hours: "12.20", charge: "12", premium: "12", preceptor: "0", units548: "0", note: "" },
  { id: uid(), date: "2026-06-28", hours: "14.90", charge: "0", premium: "0", preceptor: "0", units548: "8", note: "16-hr extra" },
  { id: uid(), date: "2026-06-30", hours: "12.00", charge: "4", premium: "0", preceptor: "0", units548: "0", note: "" },
  { id: uid(), date: "2026-07-01", hours: "11.80", charge: "12", premium: "0", preceptor: "0", units548: "0", note: "" },
  { id: uid(), date: "2026-07-02", hours: "15.70", charge: "12", premium: "0", preceptor: "0", units548: "2", note: "Ext > 4h" },
  { id: uid(), date: "2026-07-05", hours: "15.80", charge: "12", premium: "0", preceptor: "0", units548: "8", note: "16-hr extra" },
];

// actual stub values (PP 6/22–7/05) for the audit tab
const ACTUAL_SEED = {
  reg: "4202.40", ot: "1354.71", dt: "1744.00", weekend: "61.40", evening: "36.90",
  charge: "156.00", premium: "108.00", preceptor: "0", bonus548: "1200.00", imputed: "1.81",
  gross: "8865.22", fed: "1120.64", mn: "492.55", ss: "523.72", medicare: "122.49",
  mnFam: "11.96", mnMed: "27.04", pretax: "683.98", aftertax: "99.04", net: "5781.99",
};

/* ================= engine ================= */
function computePeriod(shifts, cfg) {
  const base = num(cfg.baseRate);
  const dtDaily = num(cfg.dtDaily), otPeriod = num(cfg.otPeriod);
  let straight = 0, dt = 0, worked = 0, weekendH = 0, chargeH = 0, premiumH = 0, preceptH = 0, units548 = 0;
  shifts.forEach((s) => {
    const h = num(s.hours);
    worked += h;
    dt += Math.max(0, h - dtDaily);
    straight += Math.min(h, dtDaily);
    if (s.date && isWeekend(s.date)) weekendH += h;
    chargeH += num(s.charge); premiumH += num(s.premium); preceptH += num(s.preceptor);
    units548 += num(s.units548);
  });
  const reg = Math.min(straight, otPeriod);
  const ot = Math.max(0, straight - otPeriod);
  const otRate = num(cfg.otRateOverride) > 0 ? num(cfg.otRateOverride) : base * num(cfg.otMult);
  const dtRate = base * num(cfg.dtMult);
  const evH = num(cfg.eveningHours);
  const lines = [
    { key: "reg", label: "Regular Straight Time", hours: reg, rate: base, amt: r2(reg * base) },
    { key: "ot", label: "Overtime (> " + otPeriod + " hrs/period)", hours: ot, rate: otRate, amt: r2(ot * otRate) },
    { key: "dt", label: "Double Time (> " + dtDaily + " hrs/day)", hours: dt, rate: dtRate, amt: r2(dt * dtRate) },
    { key: "weekend", label: "Adder – Weekend Differential", hours: weekendH, rate: num(cfg.weekendDiff), amt: r2(weekendH * num(cfg.weekendDiff)) },
    { key: "evening", label: "Shift – Evening", hours: evH, rate: num(cfg.eveningDiff), amt: r2(evH * num(cfg.eveningDiff)) },
    { key: "charge", label: "Adder – Charge Pay (308)", hours: chargeH, rate: num(cfg.chargeRate), amt: r2(chargeH * num(cfg.chargeRate)) },
    { key: "premium", label: "Adder – Premium Pay (320)", hours: premiumH, rate: num(cfg.premiumRate), amt: r2(premiumH * num(cfg.premiumRate)) },
    { key: "preceptor", label: "Adder – Preceptor Pay", hours: preceptH, rate: num(cfg.preceptorRate), amt: r2(preceptH * num(cfg.preceptorRate)) },
    { key: "bonus548", label: "Critical Shift Bonus (548)", hours: units548, rate: num(cfg.unit548), amt: r2(units548 * num(cfg.unit548)), isUnits: true },
    { key: "imputed", label: "Imputed – Basic Term Life", hours: 0, rate: 0, amt: num(cfg.imputed), nonCash: true },
  ];
  const gross = r2(lines.reduce((a, l) => a + l.amt, 0));
  return { lines, gross, worked, reg, ot, dt, units548 };
}

function computeNet(gross, cfg) {
  const imputed = num(cfg.imputed);
  const cash = gross - imputed;
  const k403 = r2(cash * num(cfg.k403bPct) / 100);
  const s125 = r2(num(cfg.med) + num(cfg.dent) + num(cfg.fsa));
  const ficaWages = r2(gross - s125);
  const ss = r2(ficaWages * 0.062);
  const medicare = r2(ficaWages * 0.0145);
  const mnFam = r2(gross * num(cfg.mnFam) / 100);
  const mnMed = r2(gross * num(cfg.mnMed) / 100);
  const fedTaxable = r2(gross - k403 - s125);
  const fed = r2(fedTaxable * num(cfg.fedEff) / 100);
  const mn = r2(fedTaxable * num(cfg.mnEff) / 100);
  const afterTax = r2(num(cfg.acc) + num(cfg.crit) + num(cfg.otherAfterTax));
  const taxes = r2(fed + mn + ss + medicare + mnFam + mnMed);
  const pretax = r2(k403 + s125);
  const net = r2(gross - taxes - pretax - afterTax - imputed);
  return { k403, s125, ficaWages, ss, medicare, mnFam, mnMed, fedTaxable, fed, mn, afterTax, taxes, pretax, net, imputed };
}

/* ================= small UI atoms ================= */
function Field({ label, value, onChange, suffix, w = "w-24", warn }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={"text-[10px] uppercase tracking-widest " + (warn ? "text-amber-400" : "text-slate-500")}>{label}</span>
      <span className="flex items-center gap-1">
        <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal"
          className={w + " bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-500"} />
        {suffix ? <span className="text-xs text-slate-500">{suffix}</span> : null}
      </span>
    </label>
  );
}

function Vital({ label, value, color, sub }) {
  return (
    <div className="flex-1 min-w-[130px] px-4 py-3 bg-slate-900/70 border border-slate-800 rounded-lg">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className={"font-mono text-2xl leading-tight " + color}>{value}</div>
      <div className={"h-0.5 mt-1 rounded " + color.replace("text-", "bg-")} style={{ opacity: 0.5 }} />
      {sub ? <div className="text-[11px] text-slate-500 mt-1">{sub}</div> : null}
    </div>
  );
}

/* ================= main ================= */
export default function RTPaycheckAuditor() {
  const [tab, setTab] = useState("shifts");
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [shifts, setShifts] = useState(DEMO_SHIFTS);
  const [actual, setActual] = useState(ACTUAL_SEED);
  const [wi, setWi] = useState({ hours: "12", units548: "10", weekend: false, charge: "0" });
  const [scan, setScan] = useState({ status: "idle", msg: "", rows: [] });

  const handleScanFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type && f.type.startsWith("image/"));
    if (!files.length) return;
    setScan({ status: "working", msg: "Reading " + files.length + " screenshot" + (files.length > 1 ? "s" : "") + "…", rows: [] });
    try {
      const raw = await parseScheduleImages(files);
      const rows = raw
        .filter((r) => r && r.date)
        .map((r) => ({ id: uid(), date: r.date, start: r.start || "", end: r.end || "", label: r.label || "", hours: schedHours(r.start, r.end, cfg) }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
      if (!rows.length) throw new Error("No shifts detected — try a tighter screenshot of just your row.");
      setScan({ status: "preview", msg: "", rows });
    } catch (err) {
      setScan({ status: "error", msg: String((err && err.message) || err), rows: [] });
    }
  };

  const applyScan = (mode) => {
    const mapped = scan.rows.map((r) => ({
      id: uid(), date: r.date, hours: r.hours != null ? String(r.hours) : "12",
      charge: "0", premium: "0", preceptor: "0", units548: "0",
      note: ((r.label ? r.label + " · " : "") + (r.start ? "sched " + r.start + "–" + r.end : "sched — fill hrs")).slice(0, 42),
    }));
    setShifts((arr) => (mode === "replace" ? mapped : [...arr, ...mapped]));
    setScan({ status: "idle", msg: "", rows: [] });
  };

  const setC = (k) => (v) => setCfg((c) => ({ ...c, [k]: v }));
  const setShift = (id, k, v) => setShifts((arr) => arr.map((s) => (s.id === id ? { ...s, [k]: v } : s)));
  const addShift = () => setShifts((arr) => [...arr, { id: uid(), date: "", hours: "12", charge: "0", premium: "0", preceptor: "0", units548: "0", note: "" }]);
  const rmShift = (id) => setShifts((arr) => arr.filter((s) => s.id !== id));

  const period = useMemo(() => computePeriod(shifts, cfg), [shifts, cfg]);
  const netCalc = useMemo(() => computeNet(period.gross, cfg), [period.gross, cfg]);

  // what-if: recompute the whole period with one extra hypothetical shift (so OT/DT rules apply correctly)
  const whatIf = useMemo(() => {
    const hypo = { id: "hypo", date: wi.weekend ? "2026-07-05" : "2026-07-01", hours: wi.hours, charge: wi.charge, premium: "0", preceptor: "0", units548: wi.units548 };
    const p2 = computePeriod([...shifts, hypo], cfg);
    const dGross = r2(p2.gross - period.gross);
    const d403 = r2(dGross * num(cfg.k403bPct) / 100);
    const dFica = r2(dGross * (0.062 + 0.0145));
    const dLeave = r2(dGross * (num(cfg.mnFam) + num(cfg.mnMed)) / 100);
    const dFedMn = r2((dGross - d403) * (num(cfg.marginalFed) + num(cfg.marginalMN)) / 100);
    const dNet = r2(dGross - d403 - dFica - dLeave - dFedMn);
    const perHr = num(wi.hours) > 0 ? r2(dNet / num(wi.hours)) : 0;
    return { dGross, d403, dFica, dLeave, dFedMn, dNet, perHr };
  }, [shifts, cfg, wi, period.gross]);

  // audit rows
  const auditRows = useMemo(() => {
    const rows = period.lines.filter((l) => l.key !== "imputed").map((l) => ({ key: l.key, label: l.label, expected: l.amt, isUnits: l.isUnits }));
    rows.push({ key: "gross", label: "TOTAL GROSS", expected: period.gross, strong: true });
    rows.push({ key: "fed", label: "Federal W/H", expected: netCalc.fed });
    rows.push({ key: "mn", label: "Minnesota W/H", expected: netCalc.mn });
    rows.push({ key: "ss", label: "Social Security 6.2%", expected: netCalc.ss });
    rows.push({ key: "medicare", label: "Medicare 1.45%", expected: netCalc.medicare });
    rows.push({ key: "mnFam", label: "MN Paid Family Leave EE", expected: netCalc.mnFam });
    rows.push({ key: "mnMed", label: "MN Paid Medical Leave EE", expected: netCalc.mnMed });
    rows.push({ key: "pretax", label: "Pretax deductions (403b + Sec 125)", expected: netCalc.pretax });
    rows.push({ key: "aftertax", label: "After-tax deductions", expected: netCalc.afterTax });
    rows.push({ key: "net", label: "TOTAL NET", expected: netCalc.net, strong: true });
    return rows;
  }, [period, netCalc]);

  const netDelta = r2(num(actual.net) - netCalc.net);
  const shortRows = auditRows.filter((r) => { const a = num(actual[r.key]); return actual[r.key] !== "" && Math.abs(a - r.expected) > 0.05; });

  const tabs = [
    { id: "shifts", label: "Shifts", Icon: CalendarClock },
    { id: "paycheck", label: "Paycheck", Icon: Activity },
    { id: "audit", label: "Audit", Icon: FileCheck2 },
    { id: "rules", label: "Rules", Icon: SlidersHorizontal },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="max-w-5xl mx-auto">
        {/* header */}
        <div className="flex items-baseline gap-3 mb-4">
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">RT Pay Auditor</h1>
          <span className="text-[11px] uppercase tracking-[0.25em] text-cyan-500">Fairview · biweekly</span>
        </div>

        {/* vitals strip */}
        <div className="flex flex-wrap gap-3 mb-5">
          <Vital label="Expected gross" value={$fmt(period.gross)} color="text-emerald-400" sub={hFmt(period.worked) + " hrs worked"} />
          <Vital label="Expected net" value={$fmt(netCalc.net)} color="text-cyan-400" sub={"taxes " + $fmt(netCalc.taxes)} />
          <Vital label="548 units" value={hFmt(period.units548)} color="text-emerald-400" sub={$fmt(period.units548 * num(cfg.unit548)) + " bonus"} />
          <Vital label="Δ stub vs expected (net)" value={(netDelta >= 0 ? "+" : "") + $fmt(netDelta)}
            color={Math.abs(netDelta) <= 0.05 ? "text-emerald-400" : "text-red-400"}
            sub={Math.abs(netDelta) <= 0.05 ? "reconciled ✓" : shortRows.length + " line(s) off — see Audit"} />
        </div>

        {/* tabs */}
        <div className="flex gap-1 mb-4 border-b border-slate-800">
          {tabs.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={"flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-md " + (tab === id ? "bg-slate-900 text-cyan-400 border border-slate-800 border-b-slate-900" : "text-slate-500 hover:text-slate-300")}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* ============ SHIFTS ============ */}
        {tab === "shifts" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-cyan-900/60 bg-cyan-950/20 p-4" tabIndex={0}
              onPaste={(e) => { const items = Array.from((e.clipboardData && e.clipboardData.files) || []); if (items.length) handleScanFiles(items); }}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-cyan-400 text-xs uppercase tracking-widest"><ScanLine size={14} /> Scan schedule</div>
                <label className="cursor-pointer text-sm bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-700 text-cyan-300 rounded-md px-3 py-1.5">
                  Upload ScheduleAnywhere screenshot(s)
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleScanFiles(e.target.files); e.target.value = ""; }} />
                </label>
                <span className="text-xs text-slate-500">or click this panel and paste · pre-fills dates + scheduled hours ({cfg.mealDeduct} hr meal off shifts &gt; {cfg.mealThreshold} hrs)</span>
              </div>
              {scan.status === "working" && (
                <div className="flex items-center gap-2 mt-3 text-sm text-cyan-300"><Loader2 size={15} className="animate-spin" /> {scan.msg}</div>
              )}
              {scan.status === "error" && (
                <div className="mt-3 text-sm text-red-400">{scan.msg} <button onClick={() => setScan({ status: "idle", msg: "", rows: [] })} className="underline text-slate-400 ml-2">dismiss</button></div>
              )}
              {scan.status === "preview" && (
                <div className="mt-3 space-y-2">
                  <table className="w-full text-xs font-mono">
                    <tbody>
                      {scan.rows.map((r) => (
                        <tr key={r.id} className="border-t border-cyan-900/40">
                          <td className="py-1 pr-3 text-slate-300 font-sans">{dayLabel(r.date)}</td>
                          <td className="py-1 pr-3 text-slate-400">{r.start ? r.start + "–" + r.end : "(no times — fill in)"}</td>
                          <td className="py-1 pr-3 text-slate-100">{r.hours != null ? hFmt(r.hours) + " h" : "—"}</td>
                          <td className="py-1 text-slate-500 font-sans">{r.label}{r.date && isWeekend(r.date) ? " · wknd" : ""}</td>
                          <td className="py-1 text-right"><button onClick={() => setScan((s) => ({ ...s, rows: s.rows.filter((x) => x.id !== r.id) }))} className="text-slate-600 hover:text-red-400"><X size={12} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => applyScan("replace")} className="text-sm bg-cyan-600/20 border border-cyan-700 text-cyan-300 rounded-md px-3 py-1.5 hover:bg-cyan-600/30">Replace shifts ({scan.rows.length})</button>
                    <button onClick={() => applyScan("append")} className="text-sm border border-slate-700 text-slate-300 rounded-md px-3 py-1.5 hover:bg-slate-800">Add to existing</button>
                    <button onClick={() => setScan({ status: "idle", msg: "", rows: [] })} className="text-sm text-slate-500 px-2">Discard</button>
                  </div>
                  <p className="text-[11px] text-slate-500">These are scheduled hours — after each shift, adjust paid hrs to your actual punches and add 548 units.</p>
                </div>
              )}
            </div>
            <p className="text-sm text-slate-400">One row per shift. Weekend differential applies automatically on Sat/Sun dates. Use the tier picker to drop bonus units into a shift — or type units directly (1 unit = {$fmt(num(cfg.unit548))}).</p>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-2 py-2">Paid hrs</th>
                    <th className="text-left px-2 py-2">Charge</th>
                    <th className="text-left px-2 py-2">Premium</th>
                    <th className="text-left px-2 py-2">Precept</th>
                    <th className="text-left px-2 py-2">548 units</th>
                    <th className="text-left px-2 py-2">Add bonus tier</th>
                    <th className="text-left px-2 py-2">Note</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s) => (
                    <tr key={s.id} className="border-t border-slate-800/70">
                      <td className="px-3 py-1.5">
                        <input type="date" value={s.date} onChange={(e) => setShift(s.id, "date", e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-100" />
                        <div className={"text-[10px] mt-0.5 " + (s.date && isWeekend(s.date) ? "text-emerald-400" : "text-slate-600")}>
                          {s.date ? dayLabel(s.date) + (isWeekend(s.date) ? " · wknd diff" : "") : "—"}
                        </div>
                      </td>
                      {["hours", "charge", "premium", "preceptor", "units548"].map((k) => (
                        <td key={k} className="px-2 py-1.5">
                          <input value={s[k]} onChange={(e) => setShift(s.id, k, e.target.value)} inputMode="decimal"
                            className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-slate-100" />
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <select value="" onChange={(e) => { const t = tiers.find((x) => x.id === e.target.value); if (t) setShift(s.id, "units548", String(r2(num(s.units548) + t.units))); }}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 max-w-[150px]">
                          <option value="">+ tier…</option>
                          {tiers.map((t) => (<option key={t.id} value={t.id}>{t.label} (+{t.units}u)</option>))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={s.note} onChange={(e) => setShift(s.id, "note", e.target.value)}
                          className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-400" />
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => rmShift(s.id)} className="text-slate-600 hover:text-red-400"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addShift} className="flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300"><Plus size={15} /> Add shift</button>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <Vital label="Regular" value={hFmt(period.reg) + " h"} color="text-slate-200" />
              <Vital label="Overtime" value={hFmt(period.ot) + " h"} color="text-amber-400" />
              <Vital label="Double time" value={hFmt(period.dt) + " h"} color="text-red-400" />
              <Vital label="Total worked" value={hFmt(period.worked) + " h"} color="text-emerald-400" />
            </div>
          </div>
        )}

        {/* ============ PAYCHECK ============ */}
        {tab === "paycheck" && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Earnings — expected</h2>
              <table className="w-full text-sm font-mono">
                <tbody>
                  {period.lines.filter((l) => l.amt !== 0).map((l) => (
                    <tr key={l.key} className="border-b border-slate-800/60">
                      <td className="py-1.5 pr-2 font-sans text-slate-300">{l.label}</td>
                      <td className="py-1.5 text-right text-slate-500">{l.hours ? hFmt(l.hours) + (l.isUnits ? "u" : "h") : ""}</td>
                      <td className="py-1.5 text-right text-slate-500">{l.rate ? "@" + hFmt(l.rate) : ""}</td>
                      <td className="py-1.5 text-right text-slate-100">{$fmt(l.amt)}</td>
                    </tr>
                  ))}
                  <tr><td className="py-2 font-sans font-semibold text-slate-100">Total gross</td><td /><td /><td className="py-2 text-right text-emerald-400 font-semibold">{$fmt(period.gross)}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Gross → net</h2>
                <table className="w-full text-sm font-mono">
                  <tbody>
                    {[
                      ["Federal W/H (" + cfg.fedEff + "% eff.)", -netCalc.fed],
                      ["Minnesota W/H (" + cfg.mnEff + "% eff.)", -netCalc.mn],
                      ["Social Security 6.2%", -netCalc.ss],
                      ["Medicare 1.45%", -netCalc.medicare],
                      ["MN Paid Family Leave", -netCalc.mnFam],
                      ["MN Paid Medical Leave", -netCalc.mnMed],
                      ["403(b) " + cfg.k403bPct + "%", -netCalc.k403],
                      ["Medical / Dental / FSA (pretax)", -netCalc.s125],
                      ["After-tax deductions", -netCalc.afterTax],
                      ["Imputed life (non-cash)", -netCalc.imputed],
                    ].map(([lab, v]) => (
                      <tr key={lab} className="border-b border-slate-800/60">
                        <td className="py-1.5 font-sans text-slate-300">{lab}</td>
                        <td className="py-1.5 text-right text-red-400">{$fmt(v)}</td>
                      </tr>
                    ))}
                    <tr><td className="py-2 font-sans font-semibold text-slate-100">Expected net</td><td className="py-2 text-right text-cyan-400 font-semibold">{$fmt(netCalc.net)}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
                <h2 className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-emerald-400 mb-3"><TrendingUp size={13} /> What-if: pick up one more shift</h2>
                <div className="flex flex-wrap gap-3 mb-3">
                  <Field label="Hours" value={wi.hours} onChange={(v) => setWi({ ...wi, hours: v })} w="w-16" />
                  <Field label="548 units" value={wi.units548} onChange={(v) => setWi({ ...wi, units548: v })} w="w-16" />
                  <Field label="Charge hrs" value={wi.charge} onChange={(v) => setWi({ ...wi, charge: v })} w="w-16" />
                  <label className="flex items-center gap-2 mt-4 text-sm text-slate-300">
                    <input type="checkbox" checked={wi.weekend} onChange={(e) => setWi({ ...wi, weekend: e.target.checked })} className="accent-emerald-500" /> Weekend
                  </label>
                </div>
                <div className="text-sm font-mono space-y-1">
                  <div className="flex justify-between"><span className="font-sans text-slate-400">Gross added (OT/DT rules applied)</span><span className="text-slate-100">{$fmt(whatIf.dGross)}</span></div>
                  <div className="flex justify-between"><span className="font-sans text-slate-400">Taxes + 403(b) on it</span><span className="text-red-400">{$fmt(-(whatIf.d403 + whatIf.dFica + whatIf.dLeave + whatIf.dFedMn))}</span></div>
                  <div className="flex justify-between border-t border-emerald-900/60 pt-1"><span className="font-sans text-emerald-300 font-semibold">Hits your account</span><span className="text-emerald-400 font-semibold">{$fmt(whatIf.dNet)} <span className="text-slate-500">({$fmt(whatIf.perHr)}/hr)</span></span></div>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">Uses marginal W/H rates ({cfg.marginalFed}% fed + {cfg.marginalMN}% MN) — edit in Rules.</p>
              </div>
            </div>
          </div>
        )}

        {/* ============ AUDIT ============ */}
        {tab === "audit" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">Type each line from the real stub into <span className="text-slate-200">Actual</span>. Anything off by more than five cents lights up red — with the shortfall in dollars and 548 units.</p>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 text-[10px] uppercase tracking-widest text-slate-500">
                    <th className="text-left px-3 py-2">Line</th>
                    <th className="text-right px-2 py-2">Expected</th>
                    <th className="text-right px-2 py-2">Actual (stub)</th>
                    <th className="text-right px-3 py-2">Δ</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {auditRows.map((r) => {
                    const aRaw = actual[r.key] ?? "";
                    const a = num(aRaw);
                    const d = r2(a - r.expected);
                    const ok = aRaw !== "" && Math.abs(d) <= 0.05;
                    const bad = aRaw !== "" && Math.abs(d) > 0.05;
                    return (
                      <tr key={r.key} className={"border-t border-slate-800/70 " + (r.strong ? "bg-slate-900/60" : "")}>
                        <td className={"px-3 py-1.5 font-sans " + (r.strong ? "font-semibold text-slate-100" : "text-slate-300")}>{r.label}</td>
                        <td className="px-2 py-1.5 text-right text-slate-400">{$fmt(r.expected)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input value={aRaw} onChange={(e) => setActual((o) => ({ ...o, [r.key]: e.target.value }))} inputMode="decimal"
                            className="w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right text-xs text-slate-100" />
                        </td>
                        <td className={"px-3 py-1.5 text-right " + (ok ? "text-emerald-400" : bad ? "text-red-400" : "text-slate-600")}>
                          {aRaw === "" ? "—" : ok ? "✓" : (d > 0 ? "+" : "") + $fmt(d) + (r.isUnits ? " (" + hFmt(d / num(cfg.unit548)) + "u)" : "")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {shortRows.length > 0 && (
              <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-4 text-sm">
                <div className="flex items-center gap-1.5 text-red-400 font-semibold mb-1"><AlertTriangle size={14} /> Discrepancy found</div>
                {shortRows.map((r) => {
                  const d = r2(num(actual[r.key]) - r.expected);
                  return <div key={r.key} className="text-slate-300">{r.label}: paid {$fmt(num(actual[r.key]))}, expected {$fmt(r.expected)} → <span className="text-red-400 font-mono">{d > 0 ? "over" : "short"} {$fmt(Math.abs(d))}{r.isUnits ? " (" + hFmt(Math.abs(d) / num(cfg.unit548)) + " units of 548)" : ""}</span></div>;
                })}
              </div>
            )}
          </div>
        )}

        {/* ============ RULES ============ */}
        {tab === "rules" && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Rates & rules (decoded from your stub)</h2>
              <div className="flex flex-wrap gap-4">
                <Field label="Base rate" value={cfg.baseRate} onChange={setC("baseRate")} suffix="$/hr" />
                <Field label="DT after (daily)" value={cfg.dtDaily} onChange={setC("dtDaily")} suffix="hrs" w="w-16" />
                <Field label="OT after (period)" value={cfg.otPeriod} onChange={setC("otPeriod")} suffix="hrs" w="w-16" />
                <Field label="OT blended rate" value={cfg.otRateOverride} onChange={setC("otRateOverride")} suffix="$/hr (blank = 1.5× base)" />
                <Field label="Weekend diff" value={cfg.weekendDiff} onChange={setC("weekendDiff")} suffix="$/hr" w="w-16" />
                <Field label="Evening diff" value={cfg.eveningDiff} onChange={setC("eveningDiff")} suffix="$/hr" w="w-16" />
                <Field label="Evening hrs (period)" value={cfg.eveningHours} onChange={setC("eveningHours")} suffix="from timecard" warn w="w-16" />
                <Field label="Charge adder" value={cfg.chargeRate} onChange={setC("chargeRate")} suffix="$/hr" w="w-16" />
                <Field label="Premium adder" value={cfg.premiumRate} onChange={setC("premiumRate")} suffix="$/hr" w="w-16" />
                <Field label="Preceptor adder" value={cfg.preceptorRate} onChange={setC("preceptorRate")} suffix="$/hr (confirm)" warn w="w-16" />
                <Field label="548 unit value" value={cfg.unit548} onChange={setC("unit548")} suffix="$/unit" w="w-16" />
                <Field label="Imputed life" value={cfg.imputed} onChange={setC("imputed")} suffix="$/check" w="w-16" />
                <Field label="Meal deduction" value={cfg.mealDeduct} onChange={setC("mealDeduct")} suffix="hr (schedule scan)" w="w-16" />
                <Field label="Meal if shift &gt;" value={cfg.mealThreshold} onChange={setC("mealThreshold")} suffix="hrs" w="w-16" />
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Bonus tiers (edit as the weekly incentive changes)</h2>
              <div className="space-y-2">
                {tiers.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <input value={t.label} onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200" />
                    <input value={t.units} onChange={(e) => setTiers((arr) => arr.map((x, j) => (j === i ? { ...x, units: num(e.target.value) } : x)))} inputMode="decimal"
                      className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-slate-200 text-right" />
                    <span className="text-xs text-slate-500 w-20 font-mono">= {$fmt(t.units * num(cfg.unit548))}</span>
                    <button onClick={() => setTiers((arr) => arr.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button onClick={() => setTiers((arr) => [...arr, { id: "t" + Date.now(), label: "New tier", units: 1 }])}
                  className="flex items-center gap-1.5 text-sm text-cyan-400 hover:text-cyan-300"><Plus size={15} /> Add tier</button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <h2 className="text-xs uppercase tracking-widest text-slate-500 mb-3">Taxes & deductions (validated against your stub to the penny)</h2>
              <div className="flex flex-wrap gap-4">
                <Field label="403(b)" value={cfg.k403bPct} onChange={setC("k403bPct")} suffix="% of cash gross" w="w-16" />
                <Field label="Medical pretax" value={cfg.med} onChange={setC("med")} suffix="$/check" />
                <Field label="Dental pretax" value={cfg.dent} onChange={setC("dent")} suffix="$/check" w="w-20" />
                <Field label="FSA" value={cfg.fsa} onChange={setC("fsa")} suffix="$/check" w="w-20" />
                <Field label="Fed W/H effective" value={cfg.fedEff} onChange={setC("fedEff")} suffix="%" w="w-20" />
                <Field label="MN W/H effective" value={cfg.mnEff} onChange={setC("mnEff")} suffix="%" w="w-20" />
                <Field label="Fed marginal (what-if)" value={cfg.marginalFed} onChange={setC("marginalFed")} suffix="%" w="w-16" />
                <Field label="MN marginal (what-if)" value={cfg.marginalMN} onChange={setC("marginalMN")} suffix="%" w="w-16" />
                <Field label="MN Fam Leave EE" value={cfg.mnFam} onChange={setC("mnFam")} suffix="%" w="w-16" />
                <Field label="MN Med Leave EE" value={cfg.mnMed} onChange={setC("mnMed")} suffix="%" w="w-16" />
                <Field label="Voluntary accident" value={cfg.acc} onChange={setC("acc")} suffix="$/check" w="w-16" />
                <Field label="Critical illness" value={cfg.crit} onChange={setC("crit")} suffix="$/check" w="w-16" />
                <Field label="Other after-tax" value={cfg.otherAfterTax} onChange={setC("otherAfterTax")} suffix="$ (coffee, cafeteria…)" w="w-20" />
              </div>
              <p className="text-[11px] text-slate-500 mt-3">Formulas baked in: FICA wages = gross − medical/dental/FSA (403(b) stays FICA-taxable) · MN Paid Leave = % of full gross · net subtracts the non-cash imputed life. These reconciled your 6/22–7/05 stub to within $0.02.</p>
            </div>

            <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold mb-2"><AlertTriangle size={14} /> Open questions — confirm with payroll, then edit above</div>
              <div>1 · Transport: $50 up to 4 hrs, $100 beyond — does door-to-door time count, or only the transferred hours?</div>
              <div>2 · "12 = $500" — confirmed as the 12-hr extra-shift tier (10 units)?</div>
              <div>3 · What does code 301 (Eve Mgr, −4.00/day) remove? Until known, evening hours are entered manually from the timecard.</div>
              <div>4 · Preceptor adder rate — stub shows YTD only; seeded at $3/hr.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
