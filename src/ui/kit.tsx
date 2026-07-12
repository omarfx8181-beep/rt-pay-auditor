/**
 * The Knockdown ui kit — thin wrappers over the component classes in
 * index.css, which are ports of Knockdown's own (see design/tokens.md §5).
 * Every screen composes these; nothing styles itself from scratch.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/* ---------------- text & fields ---------------- */

export function Eyebrow({ children, accent, className = "" }: { children: ReactNode; accent?: boolean; className?: string }) {
  return <div className={`eyebrow ${accent ? "text-accent" : ""} ${className}`}>{children}</div>;
}

export function Field({
  label,
  value,
  onChange,
  suffix,
  warn,
  w = "w-24",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  warn?: boolean;
  w?: string;
}) {
  return (
    <label className="flex flex-col">
      <span className={`label ${warn ? "text-amber" : ""}`}>{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className={`input ${w} px-2.5 py-1.5 font-mono text-sm tabular-nums`}
        />
        {suffix ? <span className="font-mono text-[11px] text-ink-dim">{suffix}</span> : null}
      </span>
    </label>
  );
}

/* ---------------- surfaces ---------------- */

export function Card({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {title ? <Eyebrow className="mb-3">{title}</Eyebrow> : null}
      {children}
    </section>
  );
}

const CALLOUT_TONES = {
  accent: "border-accent/60 bg-accent/10",
  pos: "border-pos/60 bg-pos/10",
  neg: "border-neg/60 bg-neg/10",
  amber: "border-amber/60 bg-amber/10",
} as const;

export function CalloutCard({
  tone,
  children,
  className = "",
}: {
  tone: keyof typeof CALLOUT_TONES;
  children: ReactNode;
  className?: string;
}) {
  return <section className={`rounded-2xl border p-4 shadow-card ${CALLOUT_TONES[tone]} ${className}`}>{children}</section>;
}

/** Card whose content hides behind its header — the antidote to number soup. */
export function Disclosure({
  title,
  icon,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  /** Quiet one-liner shown while closed, so closed ≠ mysterious. */
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="eyebrow flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-ink-dim transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {!open && hint ? <p className="mt-1.5 font-mono text-[11px] text-ink-dim">{hint}</p> : null}
      {open && <div className="reveal mt-3">{children}</div>}
    </section>
  );
}

/** Ink-block hero card with Knockdown's dot texture; the glow wash is opt-in (Boost-style). */
export function Hero({ children, glow, className = "" }: { children: ReactNode; glow?: boolean; className?: string }) {
  return (
    <section className={`hero ${glow ? "hero-glow" : ""} relative overflow-hidden ${className}`}>
      <div
        className="hero-dots pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "14px 14px" }}
      />
      <div className="relative">{children}</div>
    </section>
  );
}

/* ---------------- stats ---------------- */

const STAT_TONES = {
  ink: "text-ink",
  accent: "text-accent",
  pos: "text-pos",
  neg: "text-neg",
  amber: "text-amber",
} as const;

export function StatTile({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: keyof typeof STAT_TONES;
}) {
  return (
    <div className="card p-4">
      <Eyebrow>{label}</Eyebrow>
      <div className={`mt-1 font-display text-2xl font-semibold leading-none tabular-nums ${STAT_TONES[tone]}`}>{value}</div>
      {sub ? <div className="mt-1.5 font-mono text-[11px] text-ink-dim">{sub}</div> : null}
    </div>
  );
}

/* ---------------- bottom tab bar ---------------- */

export interface Tab {
  id: string;
  label: string;
  Icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
}

/** Phone: fixed bottom bar (Knockdown's). Desktop: a top pill row — same tokens, website-first. */
export function TabBar({ tabs, active, onSelect }: { tabs: Tab[]; active: string; onSelect: (id: string, index: number) => void }) {
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-line bg-surface-bg/85 backdrop-blur-lg md:hidden">
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2 pb-[env(safe-area-inset-bottom)]">
          {tabs.map(({ id, label, Icon }, i) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                onClick={() => onSelect(id, i)}
                className={`pressable flex flex-1 flex-col items-center gap-1 py-3 font-mono text-[10px] font-semibold uppercase tracking-wider transition ${
                  isActive ? "text-accent" : "text-ink-dim hover:text-ink"
                }`}
              >
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      <nav className="mt-5 hidden gap-1.5 md:flex">
        {tabs.map(({ id, label, Icon }, i) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id, i)}
              className={`btn px-3.5 py-2 text-xs ${isActive ? "btn-primary" : "btn-ghost"} pressable`}
            >
              <Icon size={14} strokeWidth={isActive ? 2.2 : 1.8} />
              {label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
