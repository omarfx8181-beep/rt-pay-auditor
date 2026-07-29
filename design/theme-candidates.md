# Theme candidates (July 2026) — awaiting Omar's pick

> Designer exploration for the theme round. §1's five refinements are
> IMPLEMENTED (palette-neutral). §2's three directions are CANDIDATES
> only — none ships until Omar picks from the screenshots. Default
> remains Knockdown (design/tokens.md §2) if he keeps today's colors.

# RT Pay Auditor — Theme Exploration (July 2026)

Grounded in `src/index.css` (`:root` / `[data-mode="dark"]` RGB-channel tokens, `@theme inline` map, `.card`/`.hero`/`.btn` components, paper washes at lines 171–174), `design/tokens.md` §2, and token usage in `src/screens/Home.tsx` / `Goals.tsx`. All contrast figures below are computed WCAG ratios, not estimates.

## 1 · Five refinements to the current look (palette untouched)

1. **Bake display-number tracking into the type scale** — big 700-weight tabular money reads more "printed ledger" when set slightly tight, and today it's ad hoc (Home's h1 hand-adds `tracking-tight`, the hero number gets none). *Change:* add `--text-hero-num--letter-spacing: -0.02em`, `--text-large-title--letter-spacing: -0.02em`, `--text-title-2--letter-spacing: -0.01em` to `@theme`, then delete per-screen `tracking-tight`.

2. **One intra-card rhythm instead of six** — Home cards drift through `mt-0.5 / mt-1 / mt-1.5 / mt-2 / mt-2.5 / mt-3`, which reads as jitter at a glance. *Change:* allow exactly three steps inside cards — eyebrow→number `mt-2`, number→subline `mt-1`, sibling blocks `mt-4` — and sweep the screens to those utilities only.

3. **Hairlines separate; shadows only float** — the resting card already carries a border, so the near-invisible double shadow just muddies edges (and in espresso the ink-tinted shadow is literally invisible cost). *Change:* `.card` → `shadow-none` (border does the work); move elevation to layers that actually hover: `Sheet` and `UndoToast` get `box-shadow: 0 8px 24px rgb(var(--ink) / 0.10)`.

4. **Two card tiers so white means money** — every `Card` is equal-weight white today (live ticker, scoreboard, disclosures, verdict all shout at the same volume). *Change:* add `.card-quiet { @apply rounded-2xl border border-surface-line bg-transparent shadow-none; }` and demote ambient/receipt cards to it, reserving `bg-surface-card` for the hero, the verdict, and money-bearing rows.

5. **Calm the paper: washes at half strength, never fixed** — the two 6% radial washes plus `background-attachment: fixed` mottle the backdrop behind hairline cards and hit iOS Safari's slow fixed-background path. *Change:* in `body`, delete `background-attachment: fixed` and drop both washes from `/ 0.06` to `/ 0.04` (dark stays flat, as now).

## 2 · Three alternative directions

All three keep the app's grammar: ink-block hero and primary button, white cards on tinted paper, hairline borders, one accent. Values are RGB triplets for the existing token names; hex in parens for eyeballing.

### Direction A — "Paper & Iron"

Same terracotta signature, but the paper cools half a step toward stone and the ink goes graphite, so the whole app reads like a crisply printed pay ledger instead of a warm notebook. It is the smallest possible steer: every functional color deepens slightly for contrast, nothing changes meaning.

| Token | Light | Dark |
|---|---|---|
| `--ink` | `27 26 24` (#1B1A18) | `236 234 228` (#ECEAE4) |
| `--ink-dim` | `103 99 90` (#67635A) | `165 160 148` (#A5A094) |
| `--ink-faint` | `166 162 155` (#A6A29B) | `100 97 90` (#64615A) |
| `--surface-bg` | `242 240 235` (#F2F0EB) | `21 20 18` (#151412) |
| `--surface-card` | `255 255 255` (#FFFFFF) | `31 30 27` (#1F1E1B) |
| `--surface-soft` | `231 228 220` (#E7E4DC) | `42 41 37` (#2A2925) |
| `--surface-line` | `215 211 201` (#D7D3C9) | `56 54 48` (#383630) |
| `--accent` | `200 100 47` (#C8642F) | `224 132 76` (#E0844C) |
| `--on-accent` | `255 255 255` | `21 20 18` |
| `--pos` | `43 100 73` (#2B6449) | `92 180 138` (#5CB48A) |
| `--neg` | `158 58 42` (#9E3A2A) | `216 100 70` (#D86446) |
| `--amber` | `138 93 16` (#8A5D10) | `212 163 82` (#D4A352) |
| `--blue` | `52 88 116` (#345874) | `124 158 190` (#7C9EBE) |
| `--hero-bg` | `27 26 24` | `33 32 29` (#21201D) |
| `--hero-fg` | `242 240 235` | `240 238 232` (#F0EEE8) |
| `--btn-bg` | `27 26 24` | `240 238 232` |
| `--btn-fg` | `242 240 235` | `21 20 18` |

Derived tokens in the file: keep `--accent-pressed` `169 79 34` / dark `200 110 56`; `--chart` `52 122 90`; retune `--shadow-card` ink tint to the new graphite (moot if refinement 3 lands).

**Contrast sanity (computed):** light — ink 15.3:1 bg / 17.4:1 card, ink-dim 5.3/6.0, accent 3.5, pos 6.1, neg 6.0, amber 5.1, hero-fg 15.3, on-accent 4.0. Dark — ink 15.3/13.9, accent 6.6, pos 7.3, neg 5.1 (4.6 on card). Pos (deep green) vs neg (brick, pushed a step redder than today to widen its gap from terracotta) vs accent (orange) remain three clearly separated hues in both modes.

### Direction B — "Clinic Calm"

Eucalyptus-teal accent and a pine-green hero on warm white — the respiratory-care world's own palette, worn like clean scrubs: unhurried, competent, quietly on your side. Money stays money: pos is a distinctly leafier green ~40° of hue away from the teal accent, always signed, and neg keeps the familiar brick.

| Token | Light | Dark |
|---|---|---|
| `--ink` | `23 26 23` (#171A17) | `231 234 227` (#E7EAE3) |
| `--ink-dim` | `92 101 93` (#5C655D) | `157 168 157` (#9DA89D) |
| `--ink-faint` | `162 166 159` (#A2A69F) | `95 103 95` (#5F675F) |
| `--surface-bg` | `247 245 239` (#F7F5EF) | `19 23 20` (#131714) |
| `--surface-card` | `255 255 255` (#FFFFFF) | `28 33 29` (#1C211D) |
| `--surface-soft` | `234 232 222` (#EAE8DE) | `38 44 39` (#262C27) |
| `--surface-line` | `217 214 200` (#D9D6C8) | `53 61 54` (#353D36) |
| `--accent` | `46 110 102` (#2E6E66) | `88 172 166` (#58ACA6) |
| `--on-accent` | `255 255 255` | `19 23 20` |
| `--pos` | `51 105 63` (#33693F) | `108 186 131` (#6CBA83) |
| `--neg` | `168 65 46` (#A8412E) | `216 100 70` (#D86446) |
| `--amber` | `145 98 18` (#916212) | `214 162 78` (#D6A24E) |
| `--blue` | `51 96 140` (#33608C) | `122 166 205` (#7AA6CD) |
| `--hero-bg` | `28 43 38` (#1C2B26) | `34 48 42` (#22302A) |
| `--hero-fg` | `240 243 237` (#F0F3ED) | `236 240 233` (#ECF0E9) |
| `--btn-bg` | `28 43 38` | `236 240 233` |
| `--btn-fg` | `240 243 237` | `19 23 20` |

Derived: `--accent-pressed` `36 90 84` / dark `70 148 142`; `--chart` `74 140 108`; `--color-hero-pos/neg` = the dark-mode pos/neg above.

**Contrast sanity (computed):** light — ink 16.1/17.6, ink-dim 5.5/6.0, accent 5.4 (passes as text, not just graphics), pos 6.0, neg 5.6, hero-fg 13.2. Dark — ink 14.9/13.5, accent 6.8, pos 7.8, neg 5.0 (4.5 on card). Accent↔pos separation is teal-vs-leaf plus role separation (accent lives on chrome — tabs, links, chips; pos only ever colors signed money), and pos↔neg keep the green/red + lightness double-coding that survives color-vision deficits.

### Direction C — "Midnight Shift"

Navy ink on warm ivory by day; a true deep-navy dark mode for the 7p–7a stretch — the theme named for how the money is actually earned, with terracotta kept as the ember of the current identity (navy + terracotta is a classic ledger pairing). Light mode barely moves from today; dark mode becomes the hero: the espresso room swaps for the night-shift window.

| Token | Light | Dark |
|---|---|---|
| `--ink` | `26 36 51` (#1A2433) | `235 233 226` (#EBE9E2) |
| `--ink-dim` | `90 98 112` (#5A6270) | `154 163 176` (#9AA3B0) |
| `--ink-faint` | `160 163 167` (#A0A3A7) | `92 100 111` (#5C646F) |
| `--surface-bg` | `245 242 234` (#F5F2EA) | `16 22 31` (#10161F) |
| `--surface-card` | `255 255 255` (#FFFFFF) | `26 34 48` (#1A2230) |
| `--surface-soft` | `234 231 220` (#EAE7DC) | `36 46 62` (#242E3E) |
| `--surface-line` | `213 210 199` (#D5D2C7) | `49 60 76` (#313C4C) |
| `--accent` | `200 100 47` (#C8642F) | `224 132 76` (#E0844C) |
| `--on-accent` | `255 255 255` | `16 22 31` |
| `--pos` | `47 107 79` (#2F6B4F) | `92 180 138` (#5CB48A) |
| `--neg` | `168 65 46` (#A8412E) | `222 108 79` (#DE6B4F) |
| `--amber` | `145 98 18` (#916212) | `214 162 78` (#D6A24E) |
| `--blue` | `44 93 134` (#2C5D86) | `124 168 210` (#7CA8D2) |
| `--hero-bg` | `26 36 51` | `30 41 57` (#1E2939) |
| `--hero-fg` | `243 241 233` (#F3F1E9) | `240 238 230` (#F0EEE6) |
| `--btn-bg` | `26 36 51` | `238 236 228` (#EEECE4) |
| `--btn-fg` | `243 241 233` | `16 22 31` |

Derived: `--accent-pressed` unchanged (`169 79 34` / `200 110 56`); `--chart` `58 136 98` / dark `92 180 138`; note dark `--neg` is one step brighter than today's (#DE6B4F, not #D86446) because the navy card is bluer-darker than espresso.

**Contrast sanity (computed):** light — ink 14.0/15.6, ink-dim 5.5/6.2, accent 3.5, pos 5.6, neg 5.4, hero-fg 13.8. Dark — ink 15.0/13.1, accent 6.6, pos 7.2, neg 5.5 (4.8 on card), blue 7.3. The functional trio (pos green / neg brick / accent terracotta) is untouched from today's proven set; the `blue` info token stays clearly lighter and more saturated than the near-black navy ink, so they never confuse.

## 3 · Recommendation

**Paper & Iron** — it is the only direction that is a sharpening rather than a re-decision: same terracotta, same ink-block hero, same warm-paper story, with the paper cooled half a step and every functional color deepened for crispness, which honors "don't steer too much from it" while still giving Omar a visibly more modern app.