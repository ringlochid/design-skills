# Legacy design-flow migration

Map old artifacts into the v2 design repo layout deliberately; do not delete old files during migration.

| Legacy path | v2 path |
| --- | --- |
| `00-meta/brief.md` | `00-product/brief.md` |
| `00-meta/research.md` | `00-product/research.md` |
| `00-meta/copy-pack.md` | `02-pages/<page>/content.md` or `00-product/workflows.md` |
| `00-meta/design-system/base/DESIGN.md` | `01-system/DESIGN.md` |
| `00-meta/design-system/themes/*.md` | `01-system/themes/*.md` |
| `00-meta/runtime/stitch-project.json` | `04-generated/stitch/<page>/runtime/project.json` |
| `03-pages/<page>/brief.md` | `02-pages/<page>/spec.md` |
| `03-pages/<page>/content.md` | `02-pages/<page>/content.md` |
| `03-pages/<page>/notes.md` | `02-pages/<page>/notes.md` |
| `03-pages/<page>/critique.md` | `05-review/<page>-review.md` |
| `03-pages/<page>/exports/stitch/*` | `04-generated/stitch/<page>/*` |
