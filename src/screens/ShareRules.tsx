/**
 * Beam the pay rules — hand the app to a coworker. Your rates, rules,
 * and this week's tiers become one QR; their phone scans it and starts
 * configured. Rules ONLY: never shifts, stubs, history, or the API
 * key. No server — the QR is the transport.
 */
import { useEffect, useState } from "react";
import { Loader2, QrCode, ScanLine } from "lucide-react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import type { BonusTier } from "../lib/engine.ts";
import type { CfgDraft } from "../lib/draft.ts";
import { encodeRules, parseSharedRules, type SharedRules } from "../lib/presetShare.ts";
import { Disclosure } from "../ui/kit.tsx";

/** Photos come in huge; jsQR only needs ~1600px to find a code. */
async function decodeQrFile(file: File): Promise<string | null> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return jsQR(img.data, w, h)?.data ?? null;
}

type ImportState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "error"; msg: string }
  | { status: "preview"; shared: SharedRules };

export default function ShareRulesPanel({
  name,
  cfgDraft,
  tiers,
  onApplyShared,
}: {
  name: string;
  cfgDraft: CfgDraft;
  tiers: BonusTier[];
  onApplyShared: (cfgDraft: CfgDraft, tiers: BonusTier[]) => void;
}) {
  const [qrUrl, setQrUrl] = useState("");
  const [imp, setImp] = useState<ImportState>({ status: "idle" });

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(encodeRules(name, cfgDraft, tiers), { errorCorrectionLevel: "M", margin: 2, width: 960 })
      .then((url) => {
        if (alive) setQrUrl(url);
      })
      .catch(() => {
        if (alive) setQrUrl("");
      });
    return () => {
      alive = false;
    };
  }, [name, cfgDraft, tiers]);

  const handleImport = async (file: File) => {
    setImp({ status: "working" });
    try {
      const raw = await decodeQrFile(file);
      const shared = raw === null ? null : parseSharedRules(raw);
      if (shared === null) {
        setImp({ status: "error", msg: "No pay-rules QR in that photo — get the code big and square in frame." });
        return;
      }
      setImp({ status: "preview", shared });
    } catch (err) {
      setImp({ status: "error", msg: String(err instanceof Error ? err.message : err) });
    }
  };

  return (
    <Disclosure
      title="Hand it to a coworker"
      icon={<QrCode size={13} className="text-accent" />}
      hint="Your pay rules as a QR — their phone scans, their app starts configured."
    >
      {qrUrl !== "" && (
        <div className="flex flex-col items-center gap-2">
          <img src={qrUrl} alt={`Pay rules QR for ${name}`} className="w-56 max-w-full rounded-xl border border-surface-line bg-white p-2" />
          <p className="text-center text-caption text-ink-dim">
            {name} · rules and this week's tiers only — never your shifts, stubs, or key.
          </p>
        </div>
      )}

      <div className="mt-3 border-t border-surface-line/60 pt-3">
        {imp.status === "preview" ? (
          <div>
            <p className="text-subhead font-semibold">Scanned: {imp.shared.name}</p>
            <p className="mt-0.5 text-footnote tabular-nums text-ink-dim">
              Base ${imp.shared.cfgDraft.baseRate}/hr · {imp.shared.tiers.length} bonus tier
              {imp.shared.tiers.length === 1 ? "" : "s"} — replaces your current rules for this and future periods.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => {
                  onApplyShared(imp.shared.cfgDraft, imp.shared.tiers);
                  setImp({ status: "idle" });
                }}
                className="btn btn-primary pressable text-xs"
              >
                Use these rules
              </button>
              <button onClick={() => setImp({ status: "idle" })} className="pressable px-2 text-xs text-ink-dim">
                Discard
              </button>
            </div>
          </div>
        ) : imp.status === "working" ? (
          <div className="flex items-center gap-2 text-sm text-accent">
            <Loader2 size={15} className="animate-spin" /> Reading the QR…
          </div>
        ) : (
          <>
            <label className="btn btn-ghost pressable cursor-pointer text-xs">
              <ScanLine size={14} /> Got one from a coworker? Import their QR photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImport(f);
                  e.target.value = "";
                }}
              />
            </label>
            {imp.status === "error" && (
              <p className="mt-2 text-footnote text-neg">
                {imp.msg}{" "}
                <button onClick={() => setImp({ status: "idle" })} className="text-ink-dim underline">
                  dismiss
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </Disclosure>
  );
}
