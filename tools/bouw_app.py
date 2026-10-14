"""Bouw public/ voor de echte app uit het ontwerp (concept/project) en de finale-sjablonen (appqa/finale).
Gebruik: python3 villa/tools/bouw_app.py

- Elke pagina krijgt een viewport, haar rol (speler / regia / scherm) en live.js vóór de runtime.
- Plaatjes en video's krijgen een extensie (/beeld/<id>.jpg), zodat elke host het juiste type meestuurt.
- Wat de oplossing verraadt, komt niet in public/: de Regia krijgt een 'veilige' versie van het gedeelde blok
  en de kamers die nog niet live zijn (Sala, Archivio) zijn voorlopig een eenvoudige tussenpagina.
"""
import re
import shutil
from pathlib import Path

VILLA = Path(__file__).resolve().parent.parent
KLAD = VILLA.parent
PROJECT = KLAD / 'concept' / 'project'
FINALE = KLAD / 'appqa' / 'finale'
SITE = KLAD / 'appqa' / 'site'
BLOBS = KLAD / 'artifact-files' / '1ffc2d1b-5091-4747-bfc1-ff995dbf49a4'
PUBLIC = VILLA / 'public'
MEDIA = {'uitnodiging.mp4': KLAD / 'out' / 'uitnodiging' / 'Uitnodiging Villa Bellandi.mp4'}

# pagina: rol ('entree' regelt het aanmelden zelf)
PAGINAS = {'Entree': 'entree', 'Foyer': 'speler', 'Galleria': 'speler', 'Tavolo': 'speler', 'Regia': 'regia', 'Scherm': 'scherm', 'Zegel': 'onderdeel'}
NOG_NIET = {
    'Sala': ('La Sala del Giudizio', 'Hier bezegel je straks je oordeel. Deze kamer komt in een volgende versie van de app.'),
    'Archivio': ("L'Archivio", 'Het archief van Don Vittorio komt in een volgende versie van de app.'),
}
# woorden die nooit in public/ mogen staan (ze verraden de oplossing)
VERBODEN = ['Ventricor', 'Corvessa', "DADER = 'caterina'", 'vervalst: true', 'Sei in anticipo', '22:28']

GOOGLE = re.compile(r'<link[^>]+fonts\.googleapis\.com/css2[^>]*>')
BLOB = re.compile(r'/_blob/([0-9a-f]{32})(?![0-9a-f]|\.)')
KOP = ('<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       '<meta name="theme-color" content="#050303">\n'
       '<meta name="robots" content="noindex, nofollow">\n'
       '<meta name="villa-rol" content="{rol}">\n'
       '<script src="./live.js"></script>\n')


def veilig_gedeeld():
    g = (FINALE / 'gedeeld.js').read_text(encoding='utf-8')
    g, n1 = re.subn(r"var DADER = '[^']*';", "var DADER = '';", g)
    g = g.replace('vervalst: true', 'vervalst: false')
    g, n2 = re.subn(r'var DEMO = \[.*?\n\];', 'var DEMO = [];', g, flags=re.S)
    g, n3 = re.subn(r'var HOE_WOORDEN = /.*?/;', 'var HOE_WOORDEN = /(?!)/;', g)
    g, n4 = re.subn(r'var WAAROM_WOORDEN = /.*?/;', 'var WAAROM_WOORDEN = /(?!)/;', g)
    assert (n1, n2, n3, n4) == (1, 1, 1, 1), (n1, n2, n3, n4)
    return g.rstrip() + '\n'


def bron(naam):
    if naam == 'Regia':
        tpl = (FINALE / 'Regia.tpl.html').read_text(encoding='utf-8')
        assert tpl.count('/*@@GEDEELD@@*/') == 1
        return tpl.replace('/*@@GEDEELD@@*/', veilig_gedeeld())
    return (PROJECT / (naam + '.dc.html')).read_text(encoding='utf-8')


def blob_pad(m, gebruikt):
    bid = m.group(1)
    hits = sorted(BLOBS.glob(bid + '.*'))
    if not hits:
        raise SystemExit('ontbrekend bestand voor /_blob/' + bid)
    gebruikt.add(hits[0])
    return '/beeld/' + hits[0].name


def tussenpagina(titel, tekst):
    return f'''<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>{titel} — Villa Bellandi</title>
<link href="/fonts.css" rel="stylesheet">
<style>
html,body{{margin:0;height:100%;background:#050303;color:#e9dcc0;font-family:'Jost',sans-serif}}
main{{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 32px;box-sizing:border-box;text-align:center}}
h1{{margin:0;font-family:'Bodoni Moda',serif;font-style:italic;font-weight:400;font-size:34px;color:#f4ead2}}
p{{max-width:300px;font-family:'EB Garamond',serif;font-size:19px;line-height:1.4;color:#d9c9a6}}
a{{margin-top:14px;display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border:1px solid rgba(216,182,112,.55);color:#e9dcc0;text-decoration:none;font-size:12px;letter-spacing:.2em;text-transform:uppercase}}
</style>
</head>
<body>
<main>
<h1>{titel}</h1>
<p>{tekst}</p>
<a href="Foyer.dc.html">← Terug naar de foyer</a>
</main>
</body>
</html>
'''


def doorsturen(naar):
    return ('<!doctype html><html lang="nl"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<meta name="robots" content="noindex, nofollow"><title>Villa Bellandi</title>'
            f'<script>location.replace({naar!r} + location.search);</script></head>'
            f'<body style="background:#050303"><a href="{naar}" style="color:#d8b670">Verder</a></body></html>\n')


def main():
    # public/ opnieuw opbouwen, live.js blijft staan
    live = (PUBLIC / 'live.js').read_text(encoding='utf-8')
    if PUBLIC.exists():
        shutil.rmtree(PUBLIC)
    PUBLIC.mkdir(parents=True)
    (PUBLIC / 'live.js').write_text(live, encoding='utf-8')

    gebruikt = set()
    for naam, rol in PAGINAS.items():
        s = bron(naam)
        s = GOOGLE.sub('<link href="/fonts.css" rel="stylesheet">', s)
        assert s.count('<script src="./support.js"></script>') == 1, naam
        s = s.replace('<script src="./support.js"></script>', KOP.format(rol=rol) + '<script src="./support.js"></script>')
        s = BLOB.sub(lambda m: blob_pad(m, gebruikt), s)
        (PUBLIC / (naam + '.dc.html')).write_text(s, encoding='utf-8')
        print('pagina ', naam + '.dc.html', rol)
    for naam, (titel, tekst) in NOG_NIET.items():
        (PUBLIC / (naam + '.dc.html')).write_text(tussenpagina(titel, tekst), encoding='utf-8')
        print('tussen ', naam + '.dc.html')

    (PUBLIC / 'beeld').mkdir()
    for f in sorted(gebruikt):
        shutil.copy2(f, PUBLIC / 'beeld' / f.name)
    (PUBLIC / 'media').mkdir()
    for naam, f in MEDIA.items():
        shutil.copy2(f, PUBLIC / 'media' / naam)
    shutil.copy2(SITE / 'support.js', PUBLIC / 'support.js')
    shutil.copy2(SITE / 'fonts.css', PUBLIC / 'fonts.css')
    shutil.copytree(SITE / 'fonts', PUBLIC / 'fonts')

    (PUBLIC / 'index.html').write_text(doorsturen('/Entree.dc.html'), encoding='utf-8')
    for kort, naar in (('tv', '/Scherm.dc.html'), ('regia', '/Regia.dc.html')):
        (PUBLIC / kort).mkdir()
        (PUBLIC / kort / 'index.html').write_text(doorsturen(naar), encoding='utf-8')
    (PUBLIC / 'robots.txt').write_text('User-agent: *\nDisallow: /\n', encoding='utf-8')

    # controle: niets in public/ mag de oplossing verraden
    fout = []
    for f in PUBLIC.rglob('*'):
        if f.is_file() and f.suffix in ('.html', '.js', '.css', '.txt'):
            t = f.read_text(encoding='utf-8', errors='ignore')
            fout += [f'{f.relative_to(PUBLIC)}: {w}' for w in VERBODEN if w in t]
    if fout:
        raise SystemExit('GEHEIM GELEKT:\n  ' + '\n  '.join(fout))
    groot = [f for f in PUBLIC.rglob('*') if f.is_file() and f.stat().st_size > 25 * 1024 * 1024]
    if groot:
        raise SystemExit('te groot voor Cloudflare (max 25 MiB): ' + ', '.join(map(str, groot)))
    totaal = sum(f.stat().st_size for f in PUBLIC.rglob('*') if f.is_file())
    print(f'{len(gebruikt)} beelden, {len(MEDIA)} video, totaal {totaal / 1e6:.1f} MB; geen geheimen gevonden')


if __name__ == '__main__':
    main()
