import { useMemo, useState } from "react";
import { Check, Copy, Mail, RotateCcw } from "lucide-react";
import type { Cents, Shift } from "../lib/engine.ts";
import { buildHrEmail, type EmailDiscrepancy, type EmailIdentity } from "../lib/hrEmail.ts";
import { CalloutCard, Eyebrow, Field } from "../ui/kit.tsx";

export default function HrEmailPanel({
  discrepancies,
  shifts,
  periodStart,
  periodEnd,
  unit548Cents,
  initialIdentity,
  onSaveIdentity,
}: {
  discrepancies: EmailDiscrepancy[];
  shifts: Shift[];
  periodStart: string;
  periodEnd: string;
  unit548Cents: Cents;
  initialIdentity: EmailIdentity;
  onSaveIdentity: (identity: EmailIdentity) => void;
}) {
  const [identity, setIdentity] = useState<EmailIdentity>(initialIdentity);
  const [manualBody, setManualBody] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  const email = useMemo(
    () => buildHrEmail({ periodStart, periodEnd, identity, discrepancies, shifts, unit548Cents }),
    [periodStart, periodEnd, identity, discrepancies, shifts, unit548Cents],
  );
  if (!email) return null;
  const body = manualBody ?? email.body;

  const setId = (key: keyof EmailIdentity) => (value: string) => {
    const next = { ...identity, [key]: value };
    setIdentity(next);
    onSaveIdentity(next);
  };

  const copy = async (what: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1600);
  };

  return (
    <CalloutCard tone="accent">
      <Eyebrow accent className="mb-1 flex items-center gap-1.5">
        <Mail size={13} /> The email, ready to send
      </Eyebrow>
      <p className="text-sm">
        The format that won the June dispute: exact amounts line by line, the per-shift bonus table, and the
        identical-shift comparison. Edit anything before sending — your details save on this device only.
      </p>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-3">
        <Field label="Name" value={identity.name} onChange={setId("name")} w="w-36" />
        <Field label="Employee ID" value={identity.employeeId} onChange={setId("employeeId")} w="w-28" />
        <Field label="Title" value={identity.title} onChange={setId("title")} w="w-24" />
        <Field label="Department" value={identity.department} onChange={setId("department")} w="w-44" />
      </div>

      <div className="mt-4">
        <span className="label">Subject</span>
        <div className="input px-3 py-2 text-xs">{email.subject}</div>
      </div>

      <div className="mt-3">
        <span className="label">Email{manualBody !== null ? " — edited" : ""}</span>
        <textarea
          value={body}
          onChange={(e) => setManualBody(e.target.value)}
          rows={16}
          spellCheck={false}
          wrap="off"
          className="input overflow-x-auto px-3 py-2 font-mono text-[11px] leading-relaxed"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`mailto:?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(body)}`}
          className="btn btn-primary pressable"
        >
          <Mail size={15} /> Open in Mail
        </a>
        <button onClick={() => void copy("body", body)} className="btn btn-ghost pressable">
          {copied === "body" ? <Check size={15} /> : <Copy size={15} />}
          {copied === "body" ? "Copied ✓" : "Copy email"}
        </button>
        <button onClick={() => void copy("subject", email.subject)} className="btn btn-ghost pressable">
          {copied === "subject" ? <Check size={15} /> : <Copy size={15} />}
          {copied === "subject" ? "Copied ✓" : "Copy subject"}
        </button>
        {manualBody !== null && (
          <button onClick={() => setManualBody(null)} className="btn btn-ghost pressable">
            <RotateCcw size={15} /> Regenerate
          </button>
        )}
      </div>
    </CalloutCard>
  );
}
