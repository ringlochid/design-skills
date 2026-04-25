# Artifact hygiene

Keep generated page folders human-readable.

Allowed in `04-generated/stitch/<page>/`:

- `<breakpoint>.html` — raw exported HTML
- `<breakpoint>.png` — Stitch canvas/API screenshot
- `<breakpoint>.local.png` — full-access local browser viewport screenshot
- `<breakpoint>.local.full.png` — full-access local browser full-page screenshot
- `<breakpoint>.prompt.md` — human-readable generation/remap prompt
- `locks/*.md` — human-readable semantic/copy locks
- `attempts/<label>/` — superseded visual attempts using the same human/root vs runtime split
- `runtime/` — machine files only

Put all JSON, state, metadata, inventories, layout diagnostics, logs, stderr/stdout captures, backups, and other machine artifacts under `runtime/` or `attempts/<label>/runtime/`.
