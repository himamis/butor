// Editor JS budget (docs/v2/10-quality.md): all JavaScript in dist, gzipped, ≤ 600 KB (+10 %).
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dir = 'dist/assets';
const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
let total = 0;
for (const f of files) total += gzipSync(readFileSync(join(dir, f)), { level: 9 }).length;
const kb = total / 1024;
const budget = 600;
console.log(`JS gzipped: ${kb.toFixed(1)} KB in ${files.length} files (budget ${budget} KB)`);
if (kb > budget * 1.1) {
  console.error('Over the JS budget.');
  process.exit(1);
}
