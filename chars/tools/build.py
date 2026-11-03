#!/usr/bin/env python3
# Construit les versions publiables de Steel Front à partir de chars/ :
#  - front-d-acier.html : tout le jeu dans un seul fichier (scripts locaux intégrés) ;
#  - dist/front-d-acier-crazygames.zip : index.html, scripts et ressources pour CrazyGames.
# Usage : python3 tools/build.py
import base64, os, re, zipfile

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

# polices intégrées en base64 : le fichier unique n'a besoin de rien à côté de lui
def font(m):
    data = base64.b64encode(open(m.group(1), 'rb').read()).decode()
    return 'url(data:font/woff2;base64,' + data + ')'

single = re.sub(r'<script src="([^"]+)"></script>', inline, html)
single = re.sub(r'url\((fonts/[^)]+\.woff2)\)', font, single)
open('front-d-acier.html', 'w', encoding='utf-8').write(single)

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
out = 'dist/front-d-acier-crazygames.zip'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('index.html')
    for a in sorted(assets):
        z.write(a)
print('front-d-acier.html', os.path.getsize('front-d-acier.html'), 'octets')
print(out, os.path.getsize(out), 'octets,', len(assets) + 1, 'fichiers')

# version 2D : même jeu, vue de dessus imposée (window.STEEL_VIEW_2D lu par game.js)
s2 = open('front-d-acier.html', encoding='utf-8').read()
s2 = s2.replace('<title>Steel Front', '<title>Steel Front 2D', 1)
i = s2.index('<script>')
open('front-d-acier-2d.html', 'w', encoding='utf-8').write(s2[:i] + '<script>window.STEEL_VIEW_2D = true;</script>\n' + s2[i:])
print('front-d-acier-2d.html', os.path.getsize('front-d-acier-2d.html'), 'octets')
