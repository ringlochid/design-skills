#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || process.cwd();
const required = ['00-product','01-system','02-pages','03-references','04-generated','05-review','06-handoff'];
let ok = true;
for (const dir of required) {
  const p = path.join(root, dir);
  if (!fs.existsSync(p)) { console.log(`MISSING ${dir}`); ok = false; }
}
const badTruth = ['04-generated','05-review','06-handoff'].filter(d => fs.existsSync(path.join(root,d,'.source-truth')));
for (const d of badTruth) { console.log(`BAD_SOURCE_TRUTH_MARKER ${d}/.source-truth`); ok = false; }
process.exit(ok ? 0 : 1);
