import { useState, type ClipboardEvent } from "react";
import { CalendarArrowDown, Loader2, ScanLine, X } from "lucide-react";
import { isWeekend, type EngineConfig } from "../lib/engine.ts";
import type { ShiftDraft } from "../lib/draft.ts";
import { buildScanRows, parseScheduleImages, scanRowsToDrafts, type ScanRow } from "../lib/scan.ts";
import { icsToRawShifts } from "../lib/ical.ts";
import { dayLabel, fmtNum } from "../lib/format.ts";
import { CalloutCard, Eyebrow } from "../ui/kit.tsx";

type ScanState =
  | { status: "idle" }
  | { status: "working"; msg: string }
  | { status: "error"; msg: string }
  | { status: "preview"; rows: ScanRow[] };

export default function ScanPanel({
  apiKey,
  feedUrl,
  periodStart,
  periodEnd,
  cfg,
  onApply,
}: {
  apiKey: string;
  feedUrl: string;
  periodStart: string;
  periodEnd: string;
  cfg: EngineConfig;
  onApply: (mode: "replace" | "append", drafts: ShiftDraft[]) => void;
}) {
  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const preview = (rows: ScanRow[]) => {
    if (!rows.length) throw new Error("No shifts found inside this pay period — check the period dates on Periods.");
    setScan({ status: "preview", rows });
  };

  const readIcsText = (text: string) => {
    try {
      if (!/BEGIN:VCALENDAR/i.test(text)) {
        throw new Error("That doesn't look like calendar data — it should start with BEGIN:VCALENDAR.");
      }
      preview(buildScanRows(icsToRawShifts(text, { from: periodStart, to: periodEnd }), cfg));
      setPasteOpen(false);
      setPasteText("");
    } catch (err) {
      setScan({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  const pullFeed = async () => {
    setScan({ status: "working", msg: "Pulling your posted schedule…" });
    try {
      let text: string;
      try {
        const res = await fetch(feedUrl);
        if (!res.ok) throw new Error(`feed returned ${res.status}`);
        text = await res.text();
      } catch {
        throw new Error(
          "The browser couldn't fetch the feed directly (ScheduleAnywhere blocks cross-site reads). " +
            "Plan B: open the feed URL in Safari — if it shows the schedule as text, Select All → Copy, " +
            "then use Paste calendar text here. If Safari offers Download instead, upload the file from " +
            "Files → Downloads. Same preview either way.",
        );
      }
      preview(buildScanRows(icsToRawShifts(text, { from: periodStart, to: periodEnd }), cfg));
    } catch (err) {
      setScan({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  const handleFiles = async (fileList: Iterable<File>) => {
    const files = Array.from(fileList);
    const ics = files.find((f) => f.name.toLowerCase().endsWith(".ics") || f.type === "text/calendar");
    const images = files.filter((f) => f.type?.startsWith("image/"));
    try {
      if (ics) {
        setScan({ status: "working", msg: "Reading " + ics.name + "…" });
        preview(buildScanRows(icsToRawShifts(await ics.text(), { from: periodStart, to: periodEnd }), cfg));
        return;
      }
      if (!images.length) return;
      if (!apiKey) {
        throw new Error("Screenshot scanning needs your Anthropic API key — add it under Me → Schedule scan, or pull from the calendar feed instead.");
      }
      setScan({ status: "working", msg: `Reading ${images.length} screenshot${images.length > 1 ? "s" : ""}…` });
      const raw = await parseScheduleImages(images, apiKey);
      const rows = buildScanRows(raw, cfg);
      if (!rows.length) throw new Error("No shifts detected — try a tighter screenshot of just your row.");
      setScan({ status: "preview", rows });
    } catch (err) {
      setScan({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (files.length) {
      void handleFiles(files);
      return;
    }
    const text = e.clipboardData?.getData("text") ?? "";
    if (/BEGIN:VCALENDAR/i.test(text)) readIcsText(text);
  };

  const apply = (mode: "replace" | "append", rows: ScanRow[]) => {
    onApply(mode, scanRowsToDrafts(rows));
    setScan({ status: "idle" });
  };

  return (
    <CalloutCard tone="accent">
      <div tabIndex={0} onPaste={onPaste}>
        <div className="flex flex-wrap items-center gap-3">
          <Eyebrow accent className="flex items-center gap-1.5">
            <ScanLine size={13} /> Pull schedule
          </Eyebrow>
          {feedUrl ? (
            <button onClick={() => void pullFeed()} className="btn btn-primary pressable text-xs">
              <CalendarArrowDown size={14} /> Pull from ScheduleAnywhere
            </button>
          ) : null}
          <label className="btn btn-ghost pressable cursor-pointer text-xs">
            Upload calendar file or screenshots
            <input
              type="file"
              accept="image/*,.ics,text/calendar"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={() => setPasteOpen((v) => !v)} className="btn btn-ghost pressable text-xs">
            Paste calendar text
          </button>
        </div>

        {pasteOpen && (
          <div className="reveal mt-3 space-y-2">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="Open the feed URL in Safari, Select All, Copy — then paste everything here (starts with BEGIN:VCALENDAR)."
              className="input px-3 py-2 text-[11px] leading-relaxed"
            />
            <button onClick={() => readIcsText(pasteText)} className="btn btn-primary pressable text-xs">
              Read schedule
            </button>
          </div>
        )}
        <p className="mt-2 text-[11px] text-ink-dim">
          {feedUrl
            ? `Feed pulls shifts posted for ${dayLabel(periodStart)} – ${dayLabel(periodEnd)} — no API key needed. `
            : "Best way: add your ScheduleAnywhere calendar-feed URL under Me → Schedule scan (no API key needed). "}
          Screenshots also work{apiKey ? "" : " once an Anthropic API key is set in Me"} · scheduled hours take the{" "}
          {cfg.mealDeductHours} hr meal off shifts &gt; {cfg.mealThresholdHours} hrs.
        </p>

        {scan.status === "working" && (
          <div className="mt-3 flex items-center gap-2 text-sm text-accent">
            <Loader2 size={15} className="animate-spin" /> {scan.msg}
          </div>
        )}

        {scan.status === "error" && (
          <div className="mt-3 text-sm text-neg">
            {scan.msg}{" "}
            <button onClick={() => setScan({ status: "idle" })} className="ml-2 text-ink-dim underline">
              dismiss
            </button>
          </div>
        )}

        {scan.status === "preview" && (
          <div className="mt-3 space-y-3">
            <div className="divide-y divide-accent/20 text-xs">
              {scan.rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-20 shrink-0 font-sans">{dayLabel(r.date)}</span>
                  <span className="w-28 shrink-0 text-ink-dim">{r.start ? `${r.start}–${r.end}` : "(no times)"}</span>
                  <span className="w-14 shrink-0 tabular-nums">{r.hours != null ? fmtNum(r.hours) + " h" : "—"}</span>
                  <span className="min-w-0 flex-1 truncate font-sans text-ink-dim">
                    {r.label}
                    {r.date && isWeekend(r.date) ? " · weekend" : ""}
                  </span>
                  <button
                    onClick={() =>
                      setScan((s) =>
                        s.status === "preview" ? { ...s, rows: s.rows.filter((x) => x.id !== r.id) } : s,
                      )
                    }
                    className="pressable text-ink-dim hover:text-neg"
                    aria-label="Remove row"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => apply("replace", scan.rows)} className="btn btn-primary pressable text-xs">
                Replace shifts ({scan.rows.length})
              </button>
              <button onClick={() => apply("append", scan.rows)} className="btn btn-ghost pressable text-xs">
                Add to existing
              </button>
              <button onClick={() => setScan({ status: "idle" })} className="pressable px-2 text-xs text-ink-dim">
                Discard
              </button>
            </div>
            <p className="text-[11px] text-ink-dim">
              These are scheduled hours — after each shift, adjust paid hours to your actual punches and add bonus units.
            </p>
          </div>
        )}
      </div>
    </CalloutCard>
  );
}
