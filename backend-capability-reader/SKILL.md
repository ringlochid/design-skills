---
name: backend-capability-reader
description: Inspect backend/API/codebase capabilities and constraints for UI design. Use when a design brief or page spec should be informed by routes, OpenAPI schemas, data models, auth/roles, async jobs, error states, or backend architecture.
---

# Backend Capability Reader

Goal: extract UI-relevant backend capabilities without letting existing endpoints dictate the product design.

## Workflow

1. Identify backend framework, route definitions, schema/OpenAPI sources, auth model, data models, async flows, and docs.
2. Inventory capabilities as user actions, entities, states, constraints, and failure modes.
3. Record UI-relevant constraints: pagination, latency, async status, permissions, destructive actions, validation errors, empty/loading/error states.
4. Use local browser only for runtime API docs/admin UI when that gives evidence.
5. Write `03-references/backend/capabilities.md`.

## Output shape

- Capabilities
- Entities/data shape
- User actions
- States/errors
- Auth/permission constraints
- Open questions

## Stop boundary

Do not produce layout. Do not reduce the design to CRUD endpoints. Hand off to `product-brief-writer` or `page-spec-writer`.

## Scripts

- `scripts/openapi_inventory.py`
- `scripts/route_inventory.py`
