# Design lifecycle states

Use one lifecycle vocabulary across full design runs and existing-artifact patches.

- `needs-source` — source truth is missing or wrong.
- `candidate-ready` — an artifact candidate exists and needs review.
- `review-failed` — candidate was reviewed and rejected.
- `needs-repair` — valid target shell has layout-only defects.
- `needs-remap` — breakpoint structure needs remap/regeneration.
- `manual-review-required` — quality/caveat needs human judgment.
- `budget-exhausted` — bounded repair/remap budget is used.
- `accepted-promoted` — reviewed candidate has been promoted to accepted root artifacts.
- `blocked` — missing dependency, approval, source, or artifact prevents progress.

Closure rule: handoff can close only over `accepted-promoted` artifacts or an explicitly documented manual-review exception.
