# Minimal handoff template

Write one file per page: `06-handoff/<page>.md`.

```md
# <page-name> handoff

Design system: `01-system/DESIGN.md`
Theme: `01-system/themes/<theme>.md` or `single-theme`
Review: `05-review/<page>-review.md`
Responsive plan: `02-pages/<page>/responsive-plan.md`

| Theme | Breakpoint | HTML | Stitch screenshot | Local viewport | Local full page |
| --- | --- | --- | --- | --- | --- |
| single-theme | mobile | [mobile.html](../04-generated/stitch/<page>/mobile.html) | [mobile.png](../04-generated/stitch/<page>/mobile.png) | [mobile.local.png](../04-generated/stitch/<page>/mobile.local.png) | [mobile.local.full.png](../04-generated/stitch/<page>/mobile.local.full.png) |
| single-theme | tablet | [tablet.html](../04-generated/stitch/<page>/tablet.html) | [tablet.png](../04-generated/stitch/<page>/tablet.png) | [tablet.local.png](../04-generated/stitch/<page>/tablet.local.png) | [tablet.local.full.png](../04-generated/stitch/<page>/tablet.local.full.png) |
| single-theme | desktop | [desktop.html](../04-generated/stitch/<page>/desktop.html) | [desktop.png](../04-generated/stitch/<page>/desktop.png) | [desktop.local.png](../04-generated/stitch/<page>/desktop.local.png) | [desktop.local.full.png](../04-generated/stitch/<page>/desktop.local.full.png) |
```

For multiple themes, add the theme slug before the breakpoint, e.g. `dark.desktop.html`, `light.mobile.png`. JSON metadata stays under `04-generated/stitch/<page>/runtime/` and is not part of the human handoff table unless debugging requires it.
Add notes only for missing breakpoints, known compromises, or explicit implementation instructions.

## Screenshot previews

When screenshot files exist, include Markdown image previews after the artifact table. Use relative paths from the handoff file so VS Code/GitHub preview renders them, e.g. `![desktop local full](../04-generated/stitch/<page>/desktop.local.full.png)`.
