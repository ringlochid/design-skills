# Fix lanes

Use these lanes whenever a design needs change, whether it is mid-E2E or after handoff.

- `source-fix` — product/page/design-system/responsive truth is wrong or incomplete. Use `design-source-patcher` for existing truth, or the normal source-writing leaf when creating missing truth.
- `copy-content` — visible labels, modules, or redundant wording need targeted source/content edits. Use `design-source-patcher`.
- `theme-style` — visual language, theme, hierarchy, density, or polish needs source/system update and possibly regeneration/edit.
- `responsive-remap` — breakpoint structure needs remapping. Use `responsive-plan-writer`, then `generation-pack-builder` / `stitch-adapter`.
- `local-layout` — current artifact is structurally valid but has overflow, clipping, overlap, spacing, or safe-area defects. Use `layout-repair-loop`.
- `stitch-edit` — local patching is insufficient or a reference-driven visual edit is needed. Use `stitch-adapter` in the same project.
- `review-only` — critique/audit only. Use `design-review-gate`.
- `fresh-generation` — no valid artifact exists. Use `design-workflow`.

Default rule: source before artifact, candidate before promotion, review before handoff.
