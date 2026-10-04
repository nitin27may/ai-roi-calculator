# Audit: presentation and UX

## 2.4 Presentation and UX gaps (executive audience)

**From the code audit**

| # | Gap | Where |
|---|---|---|
| U1 | No executive summary. Total cost over the plan is never shown in the app (only in the Excel Summary). There is no cost per user, transaction or document, no build-versus-run split, no year-1 or steady-state annual figure, no go/no-go verdict, no scenario headline and no portfolio roll-up. | `shell.tsx:102-128` KpiBar, `report/page.tsx` |
| U2 | Headline numbers have no ranges. Low and high values exist only in the Sensitivity tab. | `roi/page.tsx` |
| U3 | The Overview opens on a 9-lane estimator chart. Jargon appears in the headline KPIs ("AI Dev Lab", "harness", "P50"). | `overview/page.tsx` |
| U4 | The Report is print-to-PDF only, with no cover, date, author, assumptions summary or range. It isn't in the main navigation, only under export. | `report/page.tsx`, `shell.tsx` |
| U5 | The Excel Summary is a two-column list with no charts. | `lib/export.ts` |
| U6 | No onboarding: no tour, wizard, glossary or "what is a token". A first visit lands on the sample's Overview. | none |
| U7 | Field labels are terse ("Cache hit", "Sent through Batch", "Intensity by month") with no tooltips, units or source for defaults. | `components/fields.tsx` |
| U8 | Validation silently clamps values (`ui.tsx:51-53`). Schema failures show a raw message: "That change was not applied: path: message" (`store.ts:96`). | |
| U9 | The project list cards show three numbers. There is no comparison between projects. | `projects/page.tsx` |
| U10 | Accessibility: muted text is about 4.3:1 at 10.5–11.5px; SVG charts are mouse-only with no table alternative; listbox and menu have no keyboard handling; table inputs have no labels; status is shown by colour alone; trash buttons are 14px. | `globals.css`, `ui.tsx`, `add-menu.tsx` |
| U11 | Tablet and mobile: the sidebar doesn't collapse, panels are fixed-height and month tables are wide. No dark-mode toggle. | `shell.tsx`, `globals.css` |

**From the browser pass**

| # | Observation | Screenshot |
|---|---|---|
| V1 | Money shows as "$407,719" while the header pill says CAD. A CFO reading a screenshot or printout can mistake it for USD. Use C$ everywhere. | `audit-overview.png` |
| V2 | Ten alerts sit behind a tab on the Overview. Executives never see them, and architects may miss them. They need a severity summary. | `audit-overview.png` |
| V3 | The Report chart uses blue, orange, pink and yellow. The Overview uses orange for build and green for run. The colour meaning changes between pages, and the yellow Platform series is nearly invisible. | `audit-report.png` |
| V4 | The Report's first chart mixes stacked cost bars with a dashed benefit line on the same axis. It is readable, but it doesn't answer "is it worth it". A waterfall or cumulative chart should lead. | `audit-report.png` |
| V5 | At tablet width (820px) the sidebar takes about a quarter of the screen, the KPI tiles wrap 3 + 2, and the build/production timeline bar disappears. The Assumptions panel is a long scrolling form above the chart, so the chart is below the fold. | `audit-roi-tablet.png` |
| V6 | The story sentence ("3 developers build for 6 months…") on the Overview is a strong idea for executives. Keep it and promote it to the Summary. | `audit-overview.png` |

Screenshots: [overview](img/audit-overview.png), [report](img/audit-report.png), [ROI at tablet width](img/audit-roi-tablet.png).

---
Part of the [audit and product plan](README.md). Status: [PROGRESS.md](../PROGRESS.md).
