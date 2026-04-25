# Minimal handoff template

```md
# Design handoff

Design system: `01-system/DESIGN.md`
Theme: `01-system/themes/<theme>.md` or `single-theme`

## <page-name>

| Theme | Breakpoint | HTML | Screenshot | Meta |
| --- | --- | --- | --- | --- |
| single-theme | mobile | `04-generated/stitch/<page>/<page>.mobile.html` | `04-generated/stitch/<page>/<page>.mobile.png` | `04-generated/stitch/<page>/<page>.mobile.meta.json` |
| single-theme | tablet | `04-generated/stitch/<page>/<page>.tablet.html` | `04-generated/stitch/<page>/<page>.tablet.png` | `04-generated/stitch/<page>/<page>.tablet.meta.json` |
| single-theme | desktop | `04-generated/stitch/<page>/<page>.desktop.html` | `04-generated/stitch/<page>/<page>.desktop.png` | `04-generated/stitch/<page>/<page>.desktop.meta.json` |

Review: `05-review/<page>-review.md`
Responsive plan: `02-pages/<page>/responsive-plan.md`
```

For multiple themes, add the theme slug into each artifact filename, e.g. `<page>.dark.desktop.html` and `<page>.light.mobile.png`.
Add notes only for missing breakpoints, known compromises, or explicit implementation instructions.
