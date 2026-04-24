#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2] || process.cwd();
const out = [];
function walk(dir){
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,ent.name);
    if (ent.isDirectory()) walk(p); else out.push(path.relative(root,p));
  }
}
for (const d of ['04-generated','05-review','06-handoff']) walk(path.join(root,d));
console.log(out.sort().join('\n'));
