#!/usr/bin/env python3
"""Simple route keyword scanner stub. Pass files to scan for common route decorators/registrations."""
import re
import sys
import pathlib

pat = re.compile(r'''(@(?:app|router)\.(?:get|post|put|patch|delete)\([^)]*\)|(?:GET|POST|PUT|PATCH|DELETE)\s+['"]?/[A-Za-z0-9_/{}/.-]+)''')
for f in sys.argv[1:]:
    p = pathlib.Path(f)
    try:
        text = p.read_text(errors='ignore')
    except Exception:
        continue
    for i, line in enumerate(text.splitlines(), 1):
        if pat.search(line):
            print(f"{p}:{i}: {line.strip()}")
