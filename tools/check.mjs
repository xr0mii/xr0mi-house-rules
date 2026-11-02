import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root = new URL('../', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const manifest = read('module.json'), pkg = read('package.json');
assert.equal(manifest.id, 'xr0mi-house-rules');
assert.equal(manifest.version, pkg.version);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(manifest.download, `${manifest.url}/releases/download/v${manifest.version}/${manifest.id}.zip`);
assert.equal(manifest.manifest, `${manifest.url}/releases/latest/download/module.json`);
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, `v${manifest.version}`);
for (const name of [...manifest.esmodules, ...manifest.styles]) assert(existsSync(new URL(name, root)), name);
const rules = read('data/rules.json');
assert(rules.length > 0);
for (const section of rules) {
  assert(section.title.trim()); assert(section.lines.length > 0);
  assert(!section.image, 'Public package must not include the private ritual screenshot.');
}
for (const directory of ['scripts', 'tools', 'tests']) {
  for (const name of readdirSync(new URL(`${directory}/`, root)).filter(name => name.endsWith('.mjs'))) {
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(`${directory}/${name}`, root))], {stdio: 'inherit'});
    if (result.error) throw result.error;
    assert.equal(result.status, 0, name);
  }
}
console.log('Manifest, version, public assets and JavaScript syntax verified.');
