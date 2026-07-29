/**
 * Schedule scan — v1's flow ported exactly: screenshot(s) → Anthropic
 * vision call → strict JSON {date, start, end, label} → CODE computes
 * paid hours (meal rule, overnight — engine's scheduleHours; the model
 * never does math). Two deliberate differences from the artifact:
 * the API key comes from Settings (device-only, never in backups), and
 * the browser CORS header is set. Model string and prompt are v1's.
 */
import { scheduleHours, type EngineConfig } from "./engine.ts";
import { uid, type ShiftDraft } from "./draft.ts";

export interface RawScanShift {
  date: string;
  start: string;
  end: string;
  label: string;
}

export interface ScanRow {
  id: string;
  date: string;
  start: string;
  end: string;
  label: string;
  /** Engine-computed paid hours; null when times are missing. */
  hours: number | null;
}

/** v1's model + prompt, verbatim (today's date interpolated). */
export const SCAN_MODEL = "claude-sonnet-4-6";

export const scanInstruction = (todayIso: string): string =>
  "You are extracting work shifts from screenshot(s) of a ScheduleAnywhere staff schedule (hospital scheduling software) belonging to one respiratory therapist. Today is " +
  todayIso +
  ". " +
  "Dates in the image may omit the year - infer the year that places each date closest to today (schedules usually cover the current or upcoming weeks). " +
  'Extract every scheduled WORK shift. Respond with ONLY valid JSON, no markdown, no backticks, no commentary, using exactly this schema: {"shifts":[{"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","label":"unit or shift code plus any role designation, else empty string"}]} ' +
  'Rules: times in 24-hour format ("6:45a" -> "06:45", "7:15p" -> "19:15", "11:15p" -> "23:15"). ' +
  'If a cell shows a shift code without readable times, include it with "start":"" and "end":"" and put the code in label. ' +
  'If the cell or its notes carry a role designation - charge (or "chg"), preceptor/precepting, transport - include that word in label verbatim; never invent one. ' +
  "Skip OFF days, PTO, requests, holidays, and blank cells. If multiple images are parts of the same schedule, combine them and de-duplicate by date.";

/** Strict parse of the model's text — strips accidental fences, validates shape. */
export function parseScanResponse(text: string): RawScanShift[] {
  const clean = text.replace(/```json|```/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error("The response wasn't valid JSON — try a tighter screenshot of just your row.");
  }
  const shifts = (parsed as { shifts?: unknown })?.shifts;
  if (!Array.isArray(shifts)) throw new Error("No shifts found in the response.");
  return shifts
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .filter((s) => typeof s.date === "string" && s.date !== "")
    .map((s) => ({
      date: String(s.date),
      start: typeof s.start === "string" ? s.start : "",
      end: typeof s.end === "string" ? s.end : "",
      label: typeof s.label === "string" ? s.label : "",
    }));
}

/** Raw model shifts → preview rows; the CODE computes hours, not the model. */
export function buildScanRows(raw: RawScanShift[], cfg: EngineConfig): ScanRow[] {
  return raw
    .map((r) => ({ id: uid(), ...r, hours: scheduleHours(r.start, r.end, cfg) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Role designations schedules print beside the shift code — CODE reads
 * them; the model only carries the cell text through. Charge and
 * precepting set their adder for the shift's hours; a transport day
 * earns premium for the WHOLE day (payroll's rule, Jul 2026).
 */
const ADDER_PATTERNS = {
  charge: /charge|\bchg\b/i,
  premium: /transport|premium|\bprem\b/i,
  preceptor: /precept|\bpcpt\b/i,
} as const;

export interface DetectedAdders {
  charge: boolean;
  premium: boolean;
  preceptor: boolean;
}

export const detectAdders = (label: string): DetectedAdders => ({
  charge: ADDER_PATTERNS.charge.test(label),
  premium: ADDER_PATTERNS.premium.test(label),
  preceptor: ADDER_PATTERNS.preceptor.test(label),
});

/**
 * Preview rows → shift drafts, v1's applyScan mapping (note ≤ 42 chars).
 * Detected role designations pre-fill their extra-pay hours to the
 * shift's paid hours — editable like everything else after applying.
 */
export function scanRowsToDrafts(rows: ScanRow[]): ShiftDraft[] {
  return rows.map((r) => {
    const hours = r.hours != null ? String(r.hours) : "12";
    const adders = detectAdders(r.label);
    return {
      id: uid(),
      date: r.date,
      hours,
      charge: adders.charge ? hours : "0",
      premium: adders.premium ? hours : "0",
      preceptor: adders.preceptor ? hours : "0",
      units548: "0",
      note: ((r.label ? r.label + " · " : "") + (r.start ? "sched " + r.start + "–" + r.end : "sched — fill hrs")).slice(0, 42),
    };
  });
}

export const fileToB64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(blob);
  });

/**
 * The API caps a base64 image around 10 MB and a modern phone photo
 * blows straight past that — shrink big images in the browser before
 * upload. 2200px on the long edge keeps stub text crisp; the quality
 * ladder keeps the result comfortably under the cap. Anything that
 * can't be decoded (odd formats, non-browsers) falls back to the
 * original file, and the API's own error still surfaces if that fails.
 */
const SHRINK_OVER_BYTES = 3.5 * 1024 * 1024;
const MAX_EDGE_PX = 2200;

async function shrinkImage(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    // "from-image" applies the photo's EXIF rotation where supported.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return null;
    }
  }
  try {
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
      if (blob && blob.size <= SHRINK_OVER_BYTES) return blob;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/** Images become image blocks (downscaled when huge); PDFs become document blocks. */
export async function filesToContentBlocks(files: File[]): Promise<unknown[]> {
  const blocks: unknown[] = [];
  for (const f of files) {
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (isPdf && f.size > 7 * 1024 * 1024) {
      throw new Error(
        `${f.name} is ${(f.size / 1024 / 1024).toFixed(1)} MB — too big to send. Export a smaller PDF, or screenshot its pages instead.`,
      );
    }
    let payload: Blob = f;
    let mediaType = isPdf ? "application/pdf" : f.type || "image/png";
    if (!isPdf && f.size > SHRINK_OVER_BYTES) {
      const shrunk = await shrinkImage(f);
      if (shrunk) {
        payload = shrunk;
        mediaType = "image/jpeg";
      }
    }
    blocks.push({
      type: isPdf ? "document" : "image",
      source: { type: "base64", media_type: mediaType, data: await fileToB64(payload) },
    });
  }
  return blocks;
}

/**
 * Model ids retire on Anthropic's schedule, not the user's — the
 * active model is overridable from Me → Advanced (settings key
 * "scanModel"; blank = the default).
 */
let activeModel = SCAN_MODEL;
export function setScanModel(model: string | undefined | null): void {
  activeModel = model && model.trim() !== "" ? model.trim() : SCAN_MODEL;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One vision call. Key comes from Settings; nothing else leaves the
 * device, ever. Hospitals are full of dead zones, so failure speaks
 * plainly: offline notice, 90s timeout, one automatic retry on
 * busy/overloaded, and mapped 401s — never a raw TypeError.
 */
export async function callClaude(content: unknown[], instruction: string, apiKey: string, maxTokens = 1000): Promise<string> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("You're offline — scans need a connection. Everything you've entered is safe on this device.");
  }
  const attempt = async (): Promise<{ status: number; raw: string }> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: activeModel,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: [...content, { type: "text", text: instruction }] }],
        }),
      });
      // read INSIDE the timer — a stalled body must time out too
      const raw = await response.text();
      return { status: response.status, raw };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("The scan timed out — weak connection? Try again, or fewer photos at once.");
      }
      throw new Error("Couldn't reach the scan service — check your connection and try again.");
    } finally {
      clearTimeout(timer);
    }
  };

  let { status, raw } = await attempt();
  if (status === 429 || status === 529) {
    await sleep(2500);
    ({ status, raw } = await attempt());
  }

  const ok = status >= 200 && status < 300;
  let data: { content?: Array<{ type: string; text?: string }>; stop_reason?: string; error?: { type?: string; message?: string } };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error(`The scan service answered strangely (HTTP ${status}) — try again in a minute.`);
  }
  if (!ok) {
    if (status === 401 || status === 403) throw new Error("That API key didn't work — check it in Me → Scans.");
    if (status === 429 || status === 529) throw new Error("The scan service is busy — wait a minute and try again.");
    if (data.error?.type === "not_found_error") {
      throw new Error("That scan model isn't available anymore — set a newer one in Me → Advanced.");
    }
    throw new Error(data.error?.message ?? `API error (${status})`);
  }
  if (data.stop_reason === "max_tokens") {
    throw new Error("Too much to read in one pass — try fewer pages or a tighter photo.");
  }
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
}

export async function parseScheduleImages(files: File[], apiKey: string): Promise<RawScanShift[]> {
  const blocks = await filesToContentBlocks(files.filter((f) => f.type?.startsWith("image/")));
  const text = await callClaude(blocks, scanInstruction(new Date().toISOString().slice(0, 10)), apiKey);
  return parseScanResponse(text);
}
