# Starter frontend-design skill — copy into ANY project

This is a project-agnostic version of the design skill, for Omar's other
builds (client websites, new apps). To install it in a project, open that
project in Claude Code and say:

> Fetch https://raw.githubusercontent.com/omarfx8181-beep/rt-pay-auditor/main/design/starter-frontend-skill.md
> and save everything below the marker line as `.claude/skills/frontend-design/SKILL.md`,
> then adapt the color tokens to this project's brand.

Claude Code auto-loads any `.claude/skills/*/SKILL.md` from then on.

---- SKILL FILE BELOW THIS LINE ----

---
name: frontend-design
description: House design system — use whenever building or changing ANY UI (pages, components, styles, colors, type, motion). Keeps every screen on one type scale, one spacing grid, and semantic color tokens instead of generic AI-generated Tailwind.
---

# Frontend design system

Decide the tokens ONCE per project (with the client's brand), write them as
CSS variables, then compose everything from them. Never hand-pick a hex or a
font size inside a component.

## Typography — one scale, one or two families max

Pick a real scale and stick to it (rem, 1.2–1.25 ratio works):

- `display` 40–48 bold (hero only) · `h1` 32 · `h2` 24 · `h3` 20 semibold
- `body` 16/1.6 · `small` 14 · `caption` 12 medium, letter-spaced labels
  uppercase at 11px if the brand suits it.

Rules: line-height ≥1.5 for prose, tight (1.1–1.2) for display; max ~65ch
line length; numbers in data get `tabular-nums`; never introduce a size
outside the scale "because it fits".

## Spacing — 8px base grid

All padding/margins/gaps from {4, 8, 12, 16, 24, 32, 48, 64, 96}. Section
padding on marketing pages: 64–96px desktop, 48 mobile. Card padding 16–24.
One vertical-rhythm utility between siblings (e.g. `space-y-3`/`space-y-6`)
instead of ad-hoc margins.

## Color — semantic tokens, no raw hex in components

Define as CSS variables (RGB channels so alpha modifiers work), expose via
the framework (Tailwind v4 `@theme`):

- `ink` / `ink-dim` — primary / secondary text
- `surface-bg` / `surface-card` / `surface-soft` / `surface-line` — page,
  cards, fills, hairlines (borders separate; shadows stay near-flat)
- `accent` — ONE brand accent. Links, active states, highlights. Tints via
  alpha (`bg-accent/10 border-accent`), never lighter hand-mixed hexes.
- `pos` / `neg` / `warn` — semantic status, used for meaning only.

Light and dark themes = two sets of the SAME variables (`prefers-color-scheme`
plus a `data-mode` override). Components never know which theme they're in.
Contrast ≥ 4.5:1 for text, always.

## Component patterns

- **Buttons**: primary (solid ink or accent), ghost (border + card bg). All
  states designed: hover, `active:scale-[.98]`, disabled 40% opacity,
  `:focus-visible` 2px accent outline. Touch targets ≥ 44px.
- **Cards**: radius 12–20px (pick one per project), hairline border, ONE soft
  shadow token. Eyebrow label → title → body → action, consistent order.
- **Forms**: label above input, 16px input text on mobile (prevents iOS zoom),
  visible focus ring, inline error in `neg` with a plain sentence.
- **Empty states**: one friendly sentence + the primary action, never a blank
  screen.

## Motion

150–250ms ease-out for micro-interactions, 300–400ms for page/sheet
transitions; things move ≤ 24px. Everything behind `prefers-reduced-motion`.
Animation is seasoning, not the meal — one signature moment per page max.

## Avoid the generic-AI aesthetic

- No gradient-on-everything, no glassmorphism-by-default, no purple-to-blue
  SaaS hero, no emoji as section icons, no three-identical-feature-cards
  boilerplate, no lorem ipsum in deliverables.
- Neutrals do 90% of the work; the single accent earns its moments.
- Real copy, written in the product's voice, in every mock.
- Details that read "designed": consistent icon set at one stroke width,
  optical alignment over box alignment, generous whitespace before decoration.
