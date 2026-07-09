# RT Pay Auditor — design tokens, extracted from Knockdown

Source of truth: `omarfx8181-beep/knockdown` @ `6dc6449` —
`src/index.css` (theme variables + component classes), `tailwind.config.js`
(token → utility mapping), `src/lib/accents.ts` (accent overrides),
`src/components/` (ProgressMeter, Layout/tab bar), `src/pages/` (hero, type
scale usage) — validated against Omar's four app screenshots (Dashboard,
Strategies, Net worth, Tools). Nothing here is invented.

## 1 · Architecture

Knockdown themes are **style × mode**: `editorial | sterling` × `light | dark`,
set as `data-style` / `data-mode` on `<html>`. Every color is a CSS variable
holding **RGB channels** (`--ink: 20 17 15`) so Tailwind alpha modifiers work
(`text-ink/55`). The accent is user-overridable at runtime (premium accents
swap `--accent` only). RT Pay Auditor adopts the same variable architecture;
**Editorial** is the default and primary style (it's the look in the
screenshots).

## 2 · Palette

### Editorial · light (default — warm paper)

| Token | RGB channels | Hex | Role |
|---|---|---|---|
| `ink` | 20 17 15 | `#14110F` | primary text |
| `ink-dim` | 104 95 82 | `#685F52` | secondary text, eyebrows, labels |
| `surface-bg` | 244 239 230 | `#F4EFE6` | page background (warm cream) |
| `surface-card` | 255 255 255 | `#FFFFFF` | cards |
| `surface-soft` | 235 227 213 | `#EBE3D5` | soft fills, skeletons |
| `surface-line` | 216 205 184 | `#D8CDB8` | hairline borders |
| `accent` | 200 100 47 | `#C8642F` | terracotta — active tab, links, highlights |
| `pos` | 47 107 79 | `#2F6B4F` | positive money (green) |
| `neg` | 168 65 46 | `#A8412E` | negative money / shortfalls (red) |
| `amber` | 145 98 18 | `#916212` | warnings, open questions |
| `blue` | 44 93 134 | `#2C5D86` | informational |
| `hero-bg` / `hero-fg` | 20 17 15 / 244 239 230 | `#14110F` / `#F4EFE6` | ink-block hero cards |
| `btn-bg` / `btn-fg` | 20 17 15 / 244 239 230 | `#14110F` / `#F4EFE6` | primary button |
| `on-accent` | 255 255 255 | `#FFFFFF` | text on accent/pos/neg fills |
| `chart` | 58 136 98 | `#3A8862` | sparklines / curves |

Page background texture (editorial light only): two fixed 6%-opacity radial
washes — accent at 12% 8%, pos at 88% 92%:

```css
background-image:
  radial-gradient(circle at 12% 8%, rgba(200,100,47,0.06), transparent 40%),
  radial-gradient(circle at 88% 92%, rgba(47,107,79,0.06), transparent 40%);
background-attachment: fixed;
```

### Editorial · dark (warm espresso)

| Token | RGB channels | Hex |
|---|---|---|
| `ink` | 238 232 222 | `#EEE8DE` |
| `ink-dim` | 168 156 140 | `#A89C8C` |
| `surface-bg` | 23 19 16 | `#171310` |
| `surface-card` | 33 28 23 | `#211C17` |
| `surface-soft` | 45 39 32 | `#2D2720` |
| `surface-line` | 58 51 42 | `#3A332A` |
| `accent` | 224 132 76 | `#E0844C` |
| `pos` | 92 180 138 | `#5CB48A` |
| `neg` | 216 100 70 | `#D86446` |
| `amber` | 214 162 78 | `#D6A24E` |
| `blue` | 112 158 202 | `#709ECA` |
| `hero-bg` / `hero-fg` | 41 35 28 / 240 235 226 | `#29231C` / `#F0EBE2` |
| `btn-bg` / `btn-fg` | 240 235 226 / 23 19 16 | `#F0EBE2` / `#171310` |
| `on-accent` | 23 19 16 | `#171310` |
| `chart` | 92 180 138 | `#5CB48A` |

Dark modes drop the background washes (flat bg) and the hero dot texture.

### Sterling (secondary style — flat fintech, Inter everywhere)

Kept for reference; not the M2 target. Light: white bg `#FFFFFF`, card
`#F7F8FA`, green accent/pos `#04782B`, neg `#C82626`, ink `#111216`. Dark:
pure black bg `#000000`, card `#16171C`, neon green accent/pos `#00C805`,
neg `#FF5000`, ink `#F5F5F7`. Sterling also flattens type (no uppercase, no
letterspacing), pills all buttons, and hides hero dots.

### Premium accent overrides (swap `--accent` only)

default `#C8642F` · violet `124 92 246` · ocean `37 99 235` · rose
`225 29 95` · gold `202 138 4`

## 3 · Typography

Self-hosted variable fonts via `@fontsource-variable` (offline-friendly,
nothing leaves the device — these ARE web fonts, no equivalents needed):

| Role | Family | Fallbacks | Package |
|---|---|---|---|
| `font-display` | **Fraunces Variable** (warm editorial serif) | Georgia, serif | `@fontsource-variable/fraunces` (`standard.css`) |
| `font-sans` | **Spline Sans Variable** | system-ui, -apple-system, sans-serif | `@fontsource-variable/spline-sans` (`wght.css`) |
| `font-mono` | **Spline Sans Mono Variable** | ui-monospace, monospace | `@fontsource-variable/spline-sans-mono` (`wght.css`) |

Scale (as used in Knockdown pages):

- **Page title**: `font-display text-[40px] font-semibold leading-none tracking-tight`
- **Hero number**: `font-display text-[44px] font-semibold leading-none tabular-nums` (rolling odometer)
- **Big stat**: `font-display text-[32px] font-semibold leading-none`
- **Card/section titles**: `font-display font-semibold` at `text-2xl` / `text-xl` / `text-lg` / `text-base`
- **Eyebrow** (`.eyebrow`): `font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim`; page headers use `text-accent`
- **Field label** (`.label`): `font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-dim`
- **Data & helper text**: mono (subtitles, amounts, hints); body prose: sans. Numbers always `tabular-nums`.
- Body base: `antialiased`, `font-optical-sizing: auto`, `text-rendering: optimizeLegibility`

## 4 · Radii, shadows, spacing

- **Radii**: cards & heroes `rounded-2xl` (16px) · buttons & inputs
  `rounded-xl` (12px) · progress/pills/tab dots `rounded-full` · skeleton 12px
- **Shadow** (`shadow-card`, the only shadow):
  `0 1px 2px rgba(20,17,15,0.04), 0 1px 0 rgba(20,17,15,0.03)` — near-flat;
  hairline borders do the separation work
- **Spacing**: Tailwind default scale. Page shell `max-w-2xl mx-auto px-4 pb-28
  pt-[max(20px,env(safe-area-inset-top))]`; hero/card padding `p-5` (dense
  cards `p-4`); bottom nav honors `env(safe-area-inset-bottom)`
- **Focus ring**: `outline: 2px solid rgb(var(--accent)/0.9); outline-offset: 2px`
  on `:focus-visible`

## 5 · Signature component patterns

1. **Hero card** (the Knockdown module — target look for the vitals strip):
   `rounded-2xl p-5 shadow-card`, `hero-bg` fill with `hero-fg` text; dotted
   texture overlay `radial-gradient(rgba(255,255,255,0.05) 1px, transparent
   1px)` on a `14px 14px` grid at 50% opacity; optional `.hero-glow` — a 220%
   accent wash drifting over 20s. Eyebrow on top, `text-[44px]` Fraunces
   number, mono subline.
2. **Card / list row**: `rounded-2xl border border-surface-line
   bg-surface-card shadow-card`. Selected/callout rows tint with accent:
   `bg-accent/10 border-accent` (Strategies "Snowball", "Boost your payoff"
   banner) with a mono accent "Open →" affordance.
3. **Progress meter**: `h-2.5 rounded-full` track (`bg-white/15` on hero),
   fill `linear-gradient(90deg, rgb(var(--accent)), rgb(var(--pos)))`,
   milestone dots at 25/50/75%, one-time `fillBar` animation (0.9s).
4. **Buttons**: `.btn` = `rounded-xl px-4 py-2.5 font-mono text-sm
   font-semibold tracking-wide active:scale-[.98]`; `.btn-primary` uses
   `btn-bg`/`btn-fg` (ink block on light); `.btn-ghost` = card bg + line
   border, hover turns accent.
5. **Bottom tab bar**: fixed, `bg-surface-bg/85 backdrop-blur-lg`, top
   hairline; items `font-mono text-[10px] font-semibold uppercase
   tracking-wider`, active = accent, inactive = ink-dim; swipe-to-switch with
   directional `pageIn` slide (0.34s).
6. **Inputs**: `.input` = `rounded-xl border-surface-line bg-surface-card
   px-3.5 py-2.5`, focus `border-accent` + `ring-2 ring-accent/20`;
   `.label` above.

**Motion**: every animation sits behind `prefers-reduced-motion`; the app
uses celebrate-pop (380ms overshoot bezier `cubic-bezier(0.18,0.9,0.32,1.2)`),
pressable `active:scale-[0.985]`, odometer digit rolls (0.6s), self-drawing
chart lines, and a 0.25s background/color cross-fade on theme change.

**Voice**: honest, dead simple, no jargon — "Choose how to attack the pile.",
"No account, no cloud — everything you enter stays on this device." For us:
**"Short $250 (5.0 units)"**, never "variance detected".

## 6 · Mapping into RT Pay Auditor (Tailwind v4)

Knockdown is Tailwind v3 (`tailwind.config.js` maps `rgb(var(--x) /
<alpha-value>)`). This repo is Tailwind v4, so the same tokens map via
`@theme` in `src/index.css`: raw RGB-channel variables on `:root` (light) and
`[data-mode="dark"]` (espresso, plus a `prefers-color-scheme` fallback), then
`@theme inline` exposes them as `--color-*` so utilities like
`bg-surface-card`, `text-neg/80`, `border-accent` work with opacity modifiers.
Fonts registered as `--font-display/sans/mono` with the same stacks.

RT-specific semantic mapping (per SPEC §5.4–5.5):

- **Vitals strip** (Gross / Net / 548 units / Δ vs stub) → restyled as a
  Knockdown **hero card** + stat tiles: Fraunces numbers, mono eyebrows, dot
  texture. No medical-monitor cyan — Δ reconciled = `pos`, off = `neg`.
- Audit green/red → `pos` / `neg` (`text-pos` ✓, `text-neg` deltas, red rows
  tinted `bg-neg/10 border-neg`).
- Open pay-rule questions → `amber` panel (`bg-amber/10 border-amber`),
  exactly like Knockdown's callout banners.
- 548-unit bonus highlights → accent-tinted cards (`bg-accent/10
  border-accent`).
