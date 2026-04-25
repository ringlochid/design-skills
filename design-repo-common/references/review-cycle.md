# Review / repair / remap cycle

Loop budget per page/run:

- up to 3 local layout repairs
- up to 2 remap/regenerate attempts
- one independent review before final acceptance on serious E2E work

Cycle:

1. Review screenshot triplet and locks.
2. Classify failure: source-contract, local-layout, responsive-remap, generation-quality, or manual-polish.
3. Patch source truth first if source/contract is wrong.
4. Use local repair only for layout-only defects on a valid target shell.
5. Use breakpoint-specific remap/regenerate when structure is wrong.
6. Review again after every attempt.
7. Stop on accepted-promoted, needs-source, needs-remap, budget-exhausted, manual-review-required, or blocked.

Fix lane definitions live in `fix-lanes.md`; use the same lanes during full E2E work and post-handoff patching.


## Breakpoint lineage

Runtime state is the breakpoint lineage source. For missing tablet/desktop work, read `runtime/state.json` and candidate/root meta before generation. Use the approved/current Stitch screen as reference; local HTML repair comes after target-breakpoint Stitch output.
