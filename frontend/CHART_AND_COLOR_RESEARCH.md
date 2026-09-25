# Chart Library & Color Token Research — CMPDI GeoReport AI

## Part 1 — Chart/visualization library recommendation

**Findings from the codebase:** `recharts@^2.13.3` is in `package.json` but **zero components import from it anywhere in `src/`** (`grep "from ['"]recharts['"]"` returns no matches) — it's currently 100% dead weight. Likewise `react-tagcloud@^2.3.3` is installed but `TopicsWordCloud.tsx` never imports `TagCloud` — the "word cloud" is actually a hand-rolled flex-wrap of pill `<span>` badges sized by nothing but text length. `PitProductionBars.tsx` is a fully custom SVG-free div/width% bar chart with a target-marker tick, styled entirely with Tailwind classes and CSS variables.

**Recommendation: don't add a new library. Prune the unused one, keep the hand-rolled bars, and reserve recharts (already a dependency) as the fallback only if a time-series/multi-series chart becomes necessary.**

Reasoning:
- **PitProductionBars is already good.** It's on-brand (uses the exact design tokens, not a library's theme layer), has zero bundle cost, and already does the hard part (target markers) that most bar-chart libraries make you fight with via `ReferenceLine`. Replacing it with recharts/nivo/etc. would cost hours for a visual downgrade risk, not a gain.
- **react-tagcloud should be removed.** It's unused, adds a dependency + peer deps for nothing, and the pill-badge approach already reads as more polished/legible for a govtech dashboard than a literal rotated-word cloud (which often looks noisy/unprofessional in demos and is bad for a11y/judgeability).
- **If a time-series or comparison chart is needed later, use recharts, not a new library.** It's SVG-based (inherits Tailwind/CSS-variable colors directly, so dark theme is "free"), it's already installed (no new bundle line item), and its API (`<AreaChart>`, `<Bar>`, `<Line>`) is fast to pick up with ~10 hours left.
- **Why not the alternatives:** visx is a low-level primitives toolkit (Airbnb) — powerful but high setup cost, wrong tool under time pressure. Nivo is polished but heavy (bundles multiple renderers, ~300KB+ min territory) and its theming API fights hand-tuned CSS-variable palettes. Tremor is attractive (pre-styled KPI/bar components, dark mode built in) but it ships its own design system that will visually compete with the existing bespoke Tailwind tokens — reskinning it back to match costs more time than it saves. Chart.js/react-chartjs-2 (~200KB) renders to `<canvas>`, which makes crisp per-pixel theme-matching (gradients, exact target-line styling) harder than SVG. Apache ECharts is the heaviest (~1MB+) and is overkill for 2-3 chart types.

**Action item:** remove `react-tagcloud` from `package.json`/`node_modules`; leave `recharts` installed but unused (or remove it too if no time-series view ships) rather than force it into the current bar chart.

---

## Part 2 — Brand-gold vs status-amber color separation

**Token inventory (from `tailwind.config.ts`):**
- `mining-gold-bright`: `#FBBF24` — used **40+ times** across the app (nav links, hero headline accent, hover borders, CTA borders, icons, section dividers) → clearly the primary brand/accent color.
- `mining-gold-deep`: `#D97706` — used for hover states on primary buttons.
- `state-warning`: `#F59E0B` — used consistently as the semantic "warning/under target/demo mode" color in `utils.ts` (`topicStyle`), `DataState.tsx`, `Header.tsx`, `HeroSection.tsx`, `reports/page.tsx`.
- `primary-container`: `#f59e0b` — **identical hex to `state-warning`**. This is a second, unnoticed collision: two differently-named tokens resolve to the same color.

**The actual bug found:** `PitProductionBars.tsx` mixes the two systems *within the same row*. Line 43 correctly colors the under-target percentage text with `text-state-warning`, but line 54 colors the *bar fill itself* (same under-target condition) with `bg-mining-gold-bright` — the brand color — instead of `bg-state-warning`. This is the one concrete instance of the ambiguity the prompt describes; every other file already uses `state-warning` correctly for semantic warnings.

**Recommendation: (a) minor, not a new token — fix the one call site, and separate the accidental hex collision.**

1. In `PitProductionBars.tsx` line 54, change `bg-mining-gold-bright` → `bg-state-warning` so the bar fill matches the label text's semantics.
2. `state-warning` (`#F59E0B`) and `mining-gold-bright` (`#FBBF24`) are already distinguishable (18° apart isn't huge, but `F59E0B` reads visibly more orange/deep vs. `FBBF24`'s bright yellow-gold) — no new token is needed for that pair.
3. Do fix the `primary-container`/`state-warning` collision (both `#F59E0B`): give `primary-container` its own value, e.g. `#EA8A0E` (stays warm-amber, keeps it distinct from both the brand gold and the warning token), so a future component that mixes a primary-container background with a warning badge doesn't visually merge them.
