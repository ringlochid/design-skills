#!/usr/bin/env python3
"""Lightweight OpenAPI inventory stub for design skills v2.
Prints paths/methods from an OpenAPI JSON file.
"""
import json, sys
if len(sys.argv) < 2:
    print("usage: openapi_inventory.py openapi.json", file=sys.stderr); sys.exit(2)
data=json.load(open(sys.argv[1]))
for path, ops in sorted(data.get("paths", {}).items()):
    methods=", ".join(sorted(ops.keys()))
    print(f"{path}: {methods}")
