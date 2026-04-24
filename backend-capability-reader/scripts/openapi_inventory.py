#!/usr/bin/env python3
"""Create a UI-oriented backend capability summary from an OpenAPI JSON file."""
import argparse
import json
from pathlib import Path

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "options", "head"}
DESTRUCTIVE = {"delete"}
MUTATING = {"post", "put", "patch", "delete"}

parser = argparse.ArgumentParser()
parser.add_argument("openapi", help="OpenAPI JSON file")
parser.add_argument("--out", help="Markdown output path, e.g. 03-references/backend/capabilities.md")
args = parser.parse_args()

data = json.loads(Path(args.openapi).read_text())
components = data.get("components", {}) or {}
security_schemes = components.get("securitySchemes", {}) or {}
schemas = components.get("schemas", {}) or {}
paths = data.get("paths", {}) or {}

lines = ["# Backend Capability Inventory", ""]
lines += ["## Security / auth", ""]
if security_schemes:
    for name, scheme in sorted(security_schemes.items()):
        typ = scheme.get("type", "unknown")
        desc = scheme.get("description") or scheme.get("scheme") or ""
        lines.append(f"- **{name}**: {typ} {desc}".rstrip())
else:
    lines.append("- No explicit OpenAPI security schemes found.")
lines.append("")

lines += ["## Entities / schemas", ""]
if schemas:
    for name, schema in sorted(schemas.items()):
        props = sorted((schema.get("properties") or {}).keys())
        required = schema.get("required") or []
        bits = []
        if props: bits.append("fields: " + ", ".join(props[:12]))
        if required: bits.append("required: " + ", ".join(required[:12]))
        lines.append(f"- **{name}**" + (f" — {'; '.join(bits)}" if bits else ""))
else:
    lines.append("- No component schemas found.")
lines.append("")

lines += ["## API capabilities", ""]
for route, ops in sorted(paths.items()):
    for method, op in sorted((ops or {}).items()):
        if method.lower() not in HTTP_METHODS: continue
        method_l = method.lower()
        summary = op.get("summary") or op.get("operationId") or ""
        tags = ", ".join(op.get("tags") or [])
        params = op.get("parameters") or []
        responses = op.get("responses") or {}
        has_pagination = any((p.get("name", "").lower() in {"page", "limit", "offset", "cursor", "per_page"}) for p in params)
        status_codes = ", ".join(sorted(responses.keys()))
        action = "read" if method_l == "get" else "mutate"
        if method_l in DESTRUCTIVE: action = "destructive"
        lines.append(f"- `{method.upper()} {route}` — {action}" + (f": {summary}" if summary else ""))
        if tags: lines.append(f"  - tags: {tags}")
        if has_pagination: lines.append("  - UI state: paginated/list loading")
        if method_l in MUTATING: lines.append("  - UI state: pending/success/error; confirm destructive actions where relevant")
        if status_codes: lines.append(f"  - responses: {status_codes}")
lines.append("")

lines += ["## UI implications / gaps", ""]
lines.append("- Map mutating endpoints to confirmation, optimistic/pending, success, validation-error, and failure states.")
lines.append("- Map auth/security schemes to role/permission UI states.")
lines.append("- Map paginated endpoints to loading, empty, next-page/cursor, and error states.")
lines.append("- Verify async/status flows manually if routes imply jobs, runs, tasks, queues, exports, or imports.")

output = "\n".join(lines).rstrip() + "\n"
if args.out:
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(output)
else:
    print(output, end="")
