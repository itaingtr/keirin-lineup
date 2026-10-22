"""Package only the display files; private snapshots never enter dist/."""
from pathlib import Path
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def build():
    manifest=json.loads((ROOT/'.openai/hosting.json').read_text())
    if not manifest.get('static'):
        subprocess.run(['python3','scripts/build_worker.py'],cwd=ROOT,check=True)
        subprocess.run(['bash','scripts/build.sh'],cwd=ROOT,check=True)
        subprocess.run(['node','scripts/validate-artifact.mjs'],cwd=ROOT,check=True)
        return ROOT/'dist'
    source, target = ROOT / 'site', ROOT / 'dist'
    if not (source/'index.html').is_file():
        raise ValueError('A verified generated site is required')
    target.mkdir(exist_ok=True)
    for file in source.rglob('*'):
        if not file.is_file():
            continue
        if file.suffix not in ('.html', '.css', '.js', '.json'):
            continue
        relative = file.relative_to(source)
        if any(part.startswith('.') or 'snapshot' in part for part in relative.parts):
            raise ValueError('Unexpected private file in display directory')
        out = target/relative
        out.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(file,out)
    return target


if __name__ == '__main__':
    print(build())
