# Minimal handoff template

Write one file per page: `06-handoff/<page>.md`.

```md
# <page-name> handoff

Design system: `01-system/DESIGN.md`
Theme: `01-system/themes/<theme>.md` or `single-theme`
Review: `05-review/<page>-review.md`
Responsive plan: `02-pages/<page>/responsive-plan.md`

| Theme | Breakpoint | HTML | Screenshot | Meta |
| --- | --- | --- | --- | --- |
| single-theme | mobile | `04-generated/stitch/<page>/mobile.html` | `04-generated/stitch/<page>/mobile.png` | `04-generated/stitch/<page>/mobile.meta.json` |
| single-theme | tablet | `04-generated/stitch/<page>/tablet.html` | `04-generated/stitch/<page>/tablet.png` | `04-generated/stitch/<page>/tablet.meta.json` |
| single-theme | desktop | `04-generated/stitch/<page>/desktop.html` | `04-generated/stitch/<page>/desktop.png` | `04-generated/stitch/<page>/desktop.meta.json` |
```

For multiple themes, add the theme slug before the breakpoint, e.g. `dark.desktop.html`, `light.mobile.png`, `dark.tablet.meta.json`.
Add notes only for missing breakpoints, known compromises, or explicit implementation instructions.
