/**
 * The Knockdown ui kit — thin wrappers over the component classes in
 * index.css, which are ports of Knockdown's own (see design/tokens.md §5).
 * Every screen composes these; nothing styles itself from scratch.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, X } from "lucide-react";

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
          className={`input ${w} px-2.5 py-1.5 text-sm tabular-nums`}
        />
        {suffix ? <span className="text-[11px] text-ink-dim">{suffix}</span> : null}
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
      {!open && hint ? <p className="mt-1.5 text-[11px] text-ink-dim">{hint}</p> : null}
      {open && <div className="reveal mt-3">{children}</div>}
    </section>
  );
}

/** Status hero — the surface card that carries the big number (V3 §3.4). */
export function Hero({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`hero relative overflow-hidden ${className}`}>
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
      {sub ? <div className="mt-1.5 text-[11px] text-ink-dim">{sub}</div> : null}
    </div>
  );
}

/* ---------------- bottom sheet ---------------- */

/**
 * iOS-style bottom sheet (V3 §3.4) — editing keeps spatial context.
 * Backdrop tap or the close button dismisses; content scrolls inside;
 * safe-area padded; slide respects prefers-reduced-motion.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-surface-card px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(20,17,15,0.18)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={reduced ? { duration: 0 } : { type: "tween", duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-line" aria-hidden />
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-headline">{title}</h2>
              <button onClick={onClose} className="pressable grid size-11 place-items-center rounded-full text-ink-dim hover:text-ink" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
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
                className={`pressable flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wider transition ${
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
