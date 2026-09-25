# UI/UX Review — CMPDI GeoReport AI

Working doc for frontend UI/UX pass. Each section below is a placeholder tied
to one screenshot in `00_Temp_Screenshots/`. Fill in notes under each — add
more `###` sub-sections per screenshot as needed if a section covers more than
one distinct area.

Legend: 🟥 Critical · 🟧 High · 🟨 Medium · 🟩 Low / nice-to-have

---

## 1. Landing Page — Hero & Pillars
**Screenshot:** `00_Temp_Screenshots/Hero_1.png`

- **What's here:** Top nav, hero headline + CTA buttons, live stream mock panel, 4 stat tiles, "Three Mandated Functional Layers" pillar cards.

### Your notes
_(add here)_

### Claude's observations
- 🟨 Two stacked meta bars before real content: the hackathon/certification ribbon sits directly under the header, pushing the actual hero headline down. On a laptop at ~800px viewport height this ribbon + header could eat close to a third of the fold before a judge sees the value prop.
- 🟨 "Classified Access • Level 4 Clearance Required" under the CTAs is nice flavor copy, but actual auth is a plain email/password login — if someone reads that line literally and then hits a normal login form, the tone mismatch could read as over-claiming. Either lean into it (badge language on the login page too) or tone it down.
- 🟩 The "CMPDI-SYNTH-KERNEL" terminal mockup on the right is a static illustration, not live data — nothing on the page marks it as illustrative. Low risk, but if a judge asks "is that live," better to have an answer ready than get caught flat-footed.
- 🟩 Checked `MandatedPillars.tsx`: the three pillar links do navigate (`/reports`, `/dashboard`, `/dashboard`) — not dead links. Minor: "View Templates" routing to `/reports` is a slight label/destination mismatch since that page is a live report, not a template gallery.
- 🟩 Stat tiles below the hero already reuse the same card language as the dashboard KPI cards — good, that's the kind of visual consistency worth keeping as you add more sections.

- **Priority:** 🟨 Medium overall (nothing broken, just fold economy + tone consistency)
- **Recommended fix:** Consider collapsing the certification ribbon into a single inline row with the header, or make it dismissible/thinner, so the actual headline appears higher.

---

## 2. Landing Page — Subsidiary Fleet & Compliance
**Screenshot:** `00_Temp_Screenshots/Hero_2.png`

- **What's here:** "Subsidiary Operational Fleet" grid (8 cards), basin filter tabs, GovTech compliance banner, footer.

### Your notes
_(add here)_

### Claude's observations
- 🟧 **Real issue, checked in code:** every single subsidiary card's "Open Workspace" link points to `/dashboard` (`SubsidiaryFleet.tsx:151-152`), regardless of which subsidiary (BCCL, ECL, CCL, WCL, SECL, MCL, NCL, CMPDI) was clicked — and `/dashboard` only ever shows BCCL Jharia data. A judge who clicks "ECL → Open Workspace" expecting ECL data lands on BCCL data with no explanation. This is the single biggest credibility risk on this page.
  - Minimum fix: only make the BCCL card's link active; render the other 7 as visibly disabled/"Coming soon" (they already have distinct styling for BCCL via `isBCCL`, so this is a small change).
  - Better fix if time allows: keep them clickable but land on a state that says "ECL workspace — demo data shown is illustrative, full onboarding in progress" so the click isn't a silent bait-and-switch.
- 🟨 7 of 8 cards carry the same green "Active Surveillance" badge with near-identical layout — low visual differentiation, adds scroll length without adding signal for a fast judge skim. Once the fix above is in, this repetition becomes more understandable (they're clearly "not yet wired up") rather than looking like a bug.
- 🟩 Footer says "© 2025 Ministry of Coal" — this is SIH 2026, worth a quick correction for polish.
- 🟩 The three filter tabs (All/Coking/Non-Coking) are functional (`useState` + real filter logic in `SubsidiaryFleet.tsx:12-16`) — good, no note needed there.

- **Priority:** 🟧 High (the dead-end subsidiary links are the one thing here that actively misleads a user)
- **Recommended fix:** Disable/label non-BCCL cards as inactive until backend supports them, or add a subsidiary-aware empty state on `/dashboard`.

---

## 3. Intelligence Workspace — Upload & KPIs (top of page)
**Screenshot:** `00_Temp_Screenshots/Intelligence_Workspace_1.png`

- **What's here:** Workspace header bar, "Add a source document" upload dock, 4 KPI cards, pit-wise production bars (Pit 1–6).

### Your notes
_(add here)_

### Claude's observations
- 🟨 The upload dock (left column, ~32% width) has a lot of unused vertical space below the "Upload document" button — "Current session context: No uploaded document yet" sits alone in an otherwise empty column, while the right column is dense with KPIs/chart. Worth filling that space with something useful: recent uploads, a short "how this works" tip, or supported-subsidiary note — or just let the column be visually lighter/shorter so it doesn't look unfinished next to the busy right side.
- 🟨 Pit-wise production bars show actual/target numbers as text but no visual marker on the bar itself for where the target sits — you read the percentage instead of seeing over/under-target at a glance. A small tick mark at the target value would make the chart scannable without reading numbers.
- 🟩 Color use here is good: green bars = met/exceeded target, amber = under target (Pit 2, Pit 4) — clear semantic mapping, keep it.
- 🟩 KPI cards are consistent with the landing page stat tiles and the Statutory Report's key metrics — good reuse of the same visual pattern across three different pages.

- **Priority:** 🟨 Medium
- **Recommended fix:** Add a target-marker tick to the pit bars; give the upload dock either more content or a tighter min-height so it doesn't look empty by comparison.

---

## 4. Intelligence Workspace — Topics, Summary & Q&A (scrolled)
**Screenshot:** `00_Temp_Screenshots/Intelligence_Workspace_2.png`

- **What's here:** Report keyword/topic tags, compliance status list, Executive Summary sections, Source-Grounded Q&A dock with suggested-question chips.

### Your notes
_(add here)_

### Claude's observations
- 🟨 Naming ambiguity: the heading "Topics in the Report" sits above a plain keyword-frequency tag cloud (Overburden 64, Stripping Ratio 48, ...), but the app's actual `TopicTag` data (Strata Stability, Environmental Clearance, etc. — the things with status pills) appears right below under "Operational & Compliance Status" with no heading calling them "topics." Someone unfamiliar with the code would reasonably assume the tag cloud *is* "the topics." Recommend renaming the tag cloud heading to something like "Frequent Keywords" and keeping "Topics" for the status-pill list, so the labels match what each block actually is.
- 🟧 **Biggest gap on this page:** the landing page's Pillar 3 explicitly promises "audit-verified answers... with strict page-level source attribution," and the type system (`QueryResponse.citations: [{page, source}]`) supports it — but this screenshot shows the Q&A dock in its empty/pre-query state, so there's no visible citation UI to check. This needs verification with an actual answered query: does the citation (page + source) actually render clearly, or is it buried in prose? If it's not visually distinct, that's the one place in the whole app most likely to get specifically tested by judges, since it's the headline claim.
- 🟩 Suggested-question chips are a nice affordance — lowers the barrier for a judge to try the Q&A feature without typing.
- 🟩 Executive Summary numbered sections read cleanly with the left accent bar; no changes needed there.

- **Priority:** 🟧 High for the citation-rendering check (once you show me a screenshot with an actual answer, I can assess it properly); 🟨 Medium for the topics/keywords naming.
- **Recommended fix:** Rename tag-cloud heading; then send a screenshot of the Q&A dock after a real query so I can review the citation UI specifically.

---

## 5. Statutory Brief — Header & Key Metrics (top of page)
**Screenshot:** `00_Temp_Screenshots/Statutory_Report_1.png`

- **What's here:** Decision brief header, "demo data" banner, Print/Save as PDF action, report metadata row, key metrics, pit production table (start).

### Your notes
_(add here)_

### Claude's observations
- 🟩 The amber "This view is using the canonical BCCL demonstration report. It is not a newly processed document." banner is genuinely good UX — it's honest about demo-vs-real data right where it matters, which is exactly the kind of disclosure judges tend to appreciate rather than penalize. I'd actually reuse this exact pattern (a plain-language inline banner, not just a small badge) on the Intelligence Workspace page too, since right now that page only signals demo mode via the small `DataModeBadge` pill.
- 🟩 "Print / Save as PDF" is a nice touch for a page framed as a statutory/official document — fits the govtech tone.
- 🟨 This page and the Intelligence Workspace show the same KPIs and the same executive report content, just in table form vs. chart form. That's a reasonable design choice (chart = exploration, table = official record) but if a judge asks "what's the difference between these two pages," the answer should be ready: one is the interactive analysis workspace, the other is the fixed, printable, citation-of-record. Might be worth making that distinction explicit in copy somewhere (e.g. a one-line subtitle on each page).

- **Priority:** 🟩 Low — this page is in good shape; the one actionable item is porting the demo-data banner pattern back to the workspace page.
- **Recommended fix:** Add the same inline "canonical demo report" banner style to `/dashboard`.

---

## 6. Statutory Brief — Executive Report & Keywords (scrolled)
**Screenshot:** `00_Temp_Screenshots/Statutory_Report_2.png`

- **What's here:** Pit production table (rest), Executive report sections, Report topics list, Report keywords cloud.

### Your notes
_(add here)_

### Claude's observations
- 🟩 Here "Report topics" and "Report keywords" are correctly split into two clearly-labeled side-by-side lists — this is actually clearer than the equivalent section on the Intelligence Workspace page (see section 4's naming note). Worth carrying this exact labeling pattern back to the workspace page instead of inventing a fix from scratch.
- 🟩 No functional issues spotted here — content is dense but well-organized with consistent left-accent-bar treatment matching the workspace's executive summary.

- **Priority:** 🟩 Low
- **Recommended fix:** None needed here directly — use this page's "Report topics" / "Report keywords" labels as the reference when fixing section 4's naming ambiguity.

---

## Cross-cutting (applies to multiple/all pages)

### Your notes
_(add here)_

### Claude's observations
- 🟥 **Not visible in these screenshots (all desktop, 2560px wide) but confirmed in code:** `Header.tsx:51` only renders nav links at the `xl` breakpoint (1280px+). Below that — most laptops, all tablets/phones — there is no hamburger/drawer menu, so there's no way to navigate between Overview/Workspace/Reports except editing the URL. This is the most important cross-page fix regardless of what the screenshots show, since judges may well view this on a laptop under 1280px.
- 🟨 Color overload risk: the brand gold/amber (used for the primary CTA, active nav underline, "BCCL Demo Mode" badges, logo accents) is the *same* hue family used for "under target" / warning status on the pit bars and KPI variances. Right now it reads fine because context disambiguates it, but as more amber elements get added it's worth deciding whether brand-gold and status-amber should be visually distinguished (e.g. slightly different saturation/hue) so "this is clickable/branded" and "this is a warning" don't blur together.
- 🟩 Footer copyright year (© 2025) should match the actual event year (2026) — trivial, but a judge glancing at the footer would notice.
- 🟩 Same KPI-card visual language is reused consistently across landing stats, workspace KPIs, and report key metrics — this repetition is a genuine strength, not a flaw; keep extending it rather than introducing new card styles.
- 🟩 Forced dark theme (`className="dark"` hardcoded in `layout.tsx:32`, no toggle) — fine as an intentional govtech aesthetic choice, flagging only so it's confirmed as deliberate rather than an unfinished toggle.

---

## Backlog (draft — Claude's triage, pending your review/edits above)

1. 🟥 Add mobile/tablet nav (hamburger + drawer) — `Header.tsx`
2. 🟧 Disable or clearly label non-BCCL subsidiary cards on the landing fleet grid instead of linking all 8 to the same BCCL-only dashboard — `SubsidiaryFleet.tsx`
3. 🟧 Verify citation UI on an answered Q&A query — send a screenshot of that state
4. 🟨 Reuse the Statutory Report's "canonical demo report" banner pattern on the Intelligence Workspace page
5. 🟨 Rename/re-split the workspace's "Topics in the Report" tag cloud to match the Statutory Report's clearer "Report topics" / "Report keywords" split
6. 🟨 Add a target-marker tick to the pit-production bars
7. 🟨 Fill or shrink the empty space in the upload dock's left column
8. 🟩 Footer copyright year fix
9. 🟩 Decide brand-gold vs. status-amber color separation (longer-term, not urgent)

_Add/reorder once you've added your own notes above — this list is a starting point, not final._
