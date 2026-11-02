import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for (const name of readdirSync(new URL('../tests/', import.meta.url)).filter(name => name.endsWith('.mjs')).sort()) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(`../tests/${name}`, import.meta.url))], {stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
