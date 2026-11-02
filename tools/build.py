"""Build a Foundry release using only the Python standard library."""
from pathlib import Path
import hashlib
import json
import os
import zipfile

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / 'module.json').read_text(encoding='utf-8'))
if os.environ.get('GITHUB_REF_TYPE') == 'tag':
    assert os.environ['GITHUB_REF_NAME'] == 'v' + manifest['version'], 'Tag and version differ'
dist = ROOT / 'dist'
dist.mkdir(exist_ok=True)
files = [ROOT / name for name in ['module.json', 'README.md']]
for directory in ['scripts', 'styles', 'data']:
    files.extend(p for p in (ROOT / directory).rglob('*') if p.is_file())
archive = dist / (manifest['id'] + '.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(files):
        bundle.write(path, path.relative_to(ROOT).as_posix())
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    assert 'module.json' in bundle.namelist()
    assert all(not name.startswith(('/', '../')) for name in bundle.namelist())
(dist / 'module.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(dist / 'SHA256SUMS.txt').write_text(''.join(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name + '\n' for path in [archive, dist / 'module.json']), encoding='utf-8')
print('Built ' + archive.name + ' for ' + manifest['version'])
