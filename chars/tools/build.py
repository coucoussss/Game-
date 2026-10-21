#!/usr/bin/env python3
# Construit les versions publiables de Steel Front à partir de chars/ :
#  - steel-front.html : tout le jeu dans un seul fichier (scripts locaux intégrés) ;
#  - dist/steel-front-crazygames.zip : index.html, scripts et ressources pour CrazyGames.
# Usage : python3 tools/build.py
import os, re, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
html = open('index.html', encoding='utf-8').read()
scripts = re.findall(r'<script src="([^"]+)"></script>', html)
local = [s for s in scripts if not s.startswith('http')]

def inline(m):
    src = m.group(1)
    if src.startswith('http'):
        return m.group(0)
    code = open(src, encoding='utf-8').read().replace('</script', '<\\/script')
    return '<script>\n' + code + '\n</script>'

open('steel-front.html', 'w', encoding='utf-8').write(re.sub(r'<script src="([^"]+)"></script>', inline, html))

# ressources servies à côté de la page (polices, musique, images) : tout ce que index.html référence
assets = set(local)
for ref in re.findall(r'(?:src|href)="([^"#?]+)"', html):
    if not ref.startswith(('http', 'data:', '//')) and os.path.isfile(ref):
        assets.add(ref)
for d in ('fonts', 'music', 'img'):
    if os.path.isdir(d):
        for base, _, files in os.walk(d):
            for f in files:
                if not f.endswith('.md'):
                    assets.add(os.path.join(base, f))
os.makedirs('dist', exist_ok=True)
out = 'dist/steel-front-crazygames.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('index.html')
    for a in sorted(assets):
        z.write(a)
print('steel-front.html', os.path.getsize('steel-front.html'), 'octets')
print(out, os.path.getsize(out), 'octets,', len(assets) + 1, 'fichiers')
