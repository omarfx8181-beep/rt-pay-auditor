---
name: frontend-design
description: RT Pay's design system — use whenever building or changing ANY UI in this repo (screens, components, styles, colors, type, motion). Encodes the locked Knockdown palette on the V3 structure so new UI matches the app instead of generic Tailwind.
---

# RT Pay frontend design system

The look is **Knockdown's palette on the V3 structure** — warm paper, terracotta
accent, ink-block heroes — and it is LOCKED (Omar's call at the M2 gate; never
swap the palette without asking him). Everything below already exists in
`src/index.css`; compose it, don't invent.

## Hard rules

1. **Never invent a color.** Only the semantic tokens below — they're CSS
   RGB-channel variables, so alpha modifiers work (`text-neg/80`, `bg-accent/10`).
2. **Plain language in default views.** Payroll codes (548/308/320) appear only
   in receipts, `techLabel`s, and the HR email. Money talk is human: "Short
   $250 (5.0 units)", never "variance detected".
3. **Money renders through `fmtCents`** (integer cents inside — CLAUDE.md rule 2).
   Numbers always get `tabular-nums`.
4. **Both themes always.** Light (cream) and dark (espresso) come free from the
   tokens — check both before shipping. Theme metas: `#f4efe6` / `#171310`.
5. **Touch targets ≥ 44px** (`min-h-11`), focus-visible ring is built in, and
   every animation must respect `prefers-reduced-motion` (the built-ins do).

## Color tokens (semantic only)

| Use | Utility |
|---|---|
| Primary / secondary text | `text-ink` / `text-ink-dim` |
| Page / card / soft fill / hairline | `bg-surface-bg` / `bg-surface-card` / `bg-surface-soft` / `border-surface-line` |
| Accent (terracotta — active, links, highlights) | `text-accent`, `bg-accent/10 border-accent` for callout tints |
| Money good / money bad | `text-pos` / `text-neg` (tint rows `bg-neg/10 border-neg`) |
| Warnings / open questions | `amber` |
| Informational | `blue` |
| Ink-block hero & primary button | `.hero`, `.btn-primary` (hero-bg/fg, btn-bg/fg) |

Light: ink `#14110F`, cream bg `#F4EFE6`, accent `#C8642F`, pos `#2F6B4F`,
neg `#A8412E`. Dark (espresso) variants are already defined — never hand-pick
dark colors.

## Type scale (single family: Inter variable = SF Pro stand-in)

`text-hero-num` 40/44 bold · `text-large-title` 34/40 bold · `text-title-2`
22/28 semibold · `text-headline` 17/22 semibold · `text-body` · `text-subhead`
15/20 · `text-footnote` 13/18 · `text-caption` 12/16 medium.

Eyebrows/labels: `.eyebrow` and `.label` (11px, uppercase, tracked). No other
font sizes; no second family.

## Shape, spacing, elevation

- Cards `rounded-2xl` (**20px**), buttons/inputs `rounded-xl`, pills `rounded-full`.
- Vertical rhythm: `space-y-3` between cards; card padding `p-4 sm:p-5`; page
  shell `max-w-2xl px-5 pb-28` with safe-area top/bottom.
- One shadow only: `shadow-card` (near-flat) — hairline borders do separation.

## Components — compose these, never restyle from scratch

- `src/ui/kit.tsx`: `Card`, `CalloutCard` (accent/pos/neg/amber), `Disclosure`
  (progressive disclosure — the antidote to number soup), `Hero`, `StatTile`,
  `TabBar`, `Sheet` (bottom sheet editor), `UndoToast`, `Eyebrow`, `Field`.
- Class combos in markup: `.btn .btn-primary` / `.btn .btn-ghost`, `.input`,
  `.pressable` (active scale), `.card`.
- Row idioms: `RuleRow` (Me — words left, number right), `MoneyRow` (Year card),
  `PayRow` (breakdown: answer → story → receipt on successive taps).
- Motion: `page-enter` (tab slide), `reveal` (drop-down), count-up hero —
  restrained, 150–350ms, already reduced-motion-safe.

## Avoid the generic-AI aesthetic

No gradients-on-everything, no glassmorphism, no purple-blue SaaS template, no
emoji in headings, no centered-hero-with-three-feature-cards boilerplate. This
app looks like warm paper and ink: quiet surfaces, one terracotta accent,
verdicts carried by pos/neg/amber color and plain sentences.

## State survival rule (bugs live here)

The workspace remounts on period switch (`key=current.id`). Any UI state that
must survive it — active tab, undo toasts, tour, deep-link intents — lives in
the outer `App`, never inside the workspace. `e2e/workspace.spec.ts` pins this.
