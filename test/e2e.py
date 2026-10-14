"""End-to-end test van de eerste versie: tv, Regia en drie telefoons tegen de lokale Worker (poort 8790).
Gebruik: python3 villa/test/e2e.py [uitmap-voor-schermafbeeldingen]"""
import re
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASIS = 'http://127.0.0.1:8790'
UIT = Path([a for a in sys.argv[1:] if not a.startswith('--')][0] if [a for a in sys.argv[1:] if not a.startswith('--')] else '/tmp/claude-0/-home-claude/f97ae5c4-e563-5cef-a0e7-ce5de3bd21e2/scratchpad/villa/test/schermen')
UIT.mkdir(parents=True, exist_ok=True)
SPEL = Path(__file__).resolve().parent.parent / 'src' / 'spel.js'
tekst = SPEL.read_text(encoding='utf-8')
CODES = re.findall(r"'([A-Z0-9]{6})': '([a-z]+)'", tekst)
PIN = re.search(r"REGIA_PIN = '(\d+)'", tekst).group(1)

fouten, logs = [], []
WEBM = '--webm' in sys.argv


def check(ok, wat):
    print(('ok   ' if ok else 'FOUT ') + wat)
    if not ok:
        fouten.append(wat)


def wacht_op(fn, tijd=8.0, stap=0.1):
    eind = time.time() + tijd
    while time.time() < eind:
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(stap)
    return False


def nieuw(browser, naam, w, h, mobiel):
    ctx = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobiel else 1, is_mobile=mobiel, has_touch=mobiel)
    pg = ctx.new_page()
    pg.on('console', lambda m: logs.append(f'[{naam}] {m.type}: {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append(f'[{naam}] pageerror: {e}'))
    return pg


with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=document-user-activation-required'])
    tv = nieuw(b, 'tv', 1920, 1080, False)
    if WEBM:
        data = (Path(__file__).resolve().parent / 'test-6s.webm').read_bytes()
        tv.route('**/media/uitnodiging.mp4', lambda r: r.fulfill(status=200, body=data, headers={'Content-Type': 'video/webm'}))
    regia = nieuw(b, 'regia', 390, 844, True)
    spelers = [nieuw(b, f'speler{i}', 390, 844, True) for i in range(3)]

    # ── de tv vraagt om koppeling ──
    tv.goto(BASIS + '/Scherm.dc.html')
    check(wacht_op(lambda: tv.get_by_text('Koppel dit scherm').is_visible()), 'tv toont "Koppel dit scherm"')
    code = tv.evaluate('window.Villa.koppelcode')
    check(bool(re.fullmatch(r'\d{4}', code or '')), f'tv toont koppelcode {code}')
    kan_h264 = WEBM or tv.evaluate('document.createElement("video").canPlayType(\'video/mp4; codecs="avc1.4d401f, mp4a.40.2"\')')
    print('     (testbrowser speelt H.264:', repr(kan_h264), ')')
    tv.screenshot(path=str(UIT / 'tv-1-koppelen.png'))

    # ── de Regia: aanmelden ──
    regia.goto(BASIS + '/Regia.dc.html')
    check(wacht_op(lambda: regia.get_by_text('Alleen voor Donna Serafina').is_visible()), 'regia toont het aanmeldscherm')
    regia.screenshot(path=str(UIT / 'regia-1-aanmelden.png'))
    regia.fill('#regia-pin', '222222')
    regia.get_by_role('button', name='Open de Regia').click()
    check(wacht_op(lambda: regia.get_by_text('Die pincode klopt niet.').is_visible()), 'verkeerde pincode geeft een melding')
    regia.fill('#regia-pin', PIN)
    regia.keyboard.press('Enter')
    check(wacht_op(lambda: not regia.get_by_text('Alleen voor Donna Serafina').is_visible()), 'juiste pincode opent de Regia')
    check(wacht_op(lambda: regia.get_by_text('Er wacht een tv').is_visible()), 'regia ziet: er wacht een tv')
    regia.screenshot(path=str(UIT / 'regia-2-tv-wacht.png'))

    # ── koppelen ──
    regia.get_by_label('Koppelcode van de tv').fill('1111' if code != '1111' else '2222')
    regia.get_by_role('button', name='Koppel', exact=True).click()
    check(wacht_op(lambda: regia.get_by_text('Die code klopt niet.').is_visible()), 'verkeerde koppelcode geeft een melding')
    regia.get_by_label('Koppelcode van de tv').fill(code)
    regia.get_by_role('button', name='Koppel', exact=True).click()
    check(wacht_op(lambda: tv.get_by_text('Het scherm is gekoppeld').is_visible()), 'tv is gekoppeld')
    check(wacht_op(lambda: regia.get_by_text('Tv gekoppeld').is_visible()), 'regia ziet: tv gekoppeld')
    check(wacht_op(lambda: 'geluid aan' in regia.inner_text('body') or 'mag het geluid aan' in regia.inner_text('body')), 'regia vraagt om één klik op de tv')
    check(wacht_op(lambda: 'geladen: 1 van 1' in regia.inner_text('body'), 15), 'tv heeft de video vooraf geladen')
    tv.screenshot(path=str(UIT / 'tv-2-gekoppeld.png'))
    check(tv.evaluate('document.activeElement && document.activeElement.textContent.trim()') == 'Begin', 'knop "Begin" heeft focus (OK op de afstandsbediening)')
    tv.keyboard.press('Enter')
    check(wacht_op(lambda: tv.get_by_text('Benvenuti a').is_visible()), 'tv toont het wachtscherm na OK')
    check(wacht_op(lambda: 'Het geluid staat aan.' in regia.inner_text('body')), 'regia ziet: geluid staat aan')
    tv.screenshot(path=str(UIT / 'tv-3-wachtscherm.png'))

    # ── drie spelers ──
    s0 = spelers[0]
    s0.goto(BASIS + '/Entree.dc.html')
    check(wacht_op(lambda: s0.get_by_text("CODICE D'ACCESSO").is_visible()), 'speler ziet de voordeur')
    s0.get_by_role('button', name='Ontzegel uw toegang').click()
    check(wacht_op(lambda: s0.get_by_text('Vul eerst de code uit je envelop in.').is_visible()), 'lege code geeft een melding')
    s0.fill('#toegang', 'abcdef')
    s0.get_by_role('button', name='Ontzegel uw toegang').click()
    check(wacht_op(lambda: s0.get_by_text('Deze code kennen we niet.', exact=False).is_visible()), 'onbekende code geeft een melding')
    s0.screenshot(path=str(UIT / 'speler-1-foute-code.png'))
    namen = []
    for i, s in enumerate(spelers):
        c, sid = CODES[i]
        if i:
            s.goto(BASIS + '/Entree.dc.html')
            wacht_op(lambda: s.get_by_text("CODICE D'ACCESSO").is_visible())
        s.fill('#toegang', c.lower()[:3] + ' ' + c.lower()[3:])
        s.keyboard.press('Enter')
        ok = wacht_op(lambda: s.get_by_text('Donna Serafina verwacht u').is_visible(), 15)
        namen.append(s.inner_text('body').split('verwacht u, ')[-1].split('.')[0] if ok else '?')
    check(all(n != '?' for n in namen), 'drie spelers binnen, welkom: ' + ' / '.join(namen))
    check('Marco Caruso' not in namen[0] or CODES[0][1] == 'marco', 'welkomsttekst is persoonlijk')
    spelers[1].wait_for_timeout(5200)
    spelers[1].screenshot(path=str(UIT / 'speler-2-foyer.png'))
    check(wacht_op(lambda: '3' in regia.locator('text=van 15').first.locator('..').inner_text()), 'regia telt 3 van 15 binnen')

    # terugkeren zonder code: meteen de foyer
    spelers[2].reload()
    check(wacht_op(lambda: spelers[2].get_by_text('Verzegeld').first.is_visible(), 15), 'terugkerende speler komt meteen in de foyer')

    # ── deuren ──
    regia.get_by_role('button', name='Open de deur').first.click()
    check(wacht_op(lambda: all(s.get_by_text('Het geheime archief · nu open').is_visible() for s in spelers)), 'archief gaat open op alle drie de telefoons')
    regia.screenshot(path=str(UIT / 'regia-3-avond.png'), full_page=False)
    spelers[0].screenshot(path=str(UIT / 'speler-3-archief-open.png'))
    regia.get_by_role('button', name='Sluit').first.click()
    check(wacht_op(lambda: all(not s.get_by_text('Het geheime archief · nu open').is_visible() for s in spelers)), 'archief gaat weer dicht op alle telefoons')

    # ── de testvideo ──
    regia.get_by_role('button', name='Test: speel de uitnodiging af').click()
    if kan_h264:
        check(wacht_op(lambda: tv.evaluate('(() => { const v = document.querySelector("video"); return v && getComputedStyle(v).opacity === "1"; })()')), 'tv toont de video')
        tv.wait_for_timeout(2500)
        info = tv.evaluate('(() => { const v = document.querySelector("video"); return { t: v.currentTime, paused: v.paused, muted: v.muted, src: v.src.slice(0, 5) }; })()')
        check(info['t'] > 1 and not info['paused'] and not info['muted'] and info['src'] == 'blob:', 'video speelt met geluid vanaf een vooraf geladen blob')
        check(wacht_op(lambda: 'Speelt nu de uitnodiging.' in regia.inner_text('body')), 'regia ziet: speelt nu de uitnodiging')
        tv.screenshot(path=str(UIT / 'tv-4-video.png'))
        regia.get_by_role('button', name='Stop de video').click()
        check(wacht_op(lambda: tv.get_by_text('Benvenuti a').is_visible() and tv.evaluate('document.querySelector("video").paused')), 'stop: tv terug naar het wachtscherm')
        regia.get_by_role('button', name='Test: speel de uitnodiging af').click()
        check(wacht_op(lambda: not tv.evaluate('document.querySelector("video").paused')), 'nogmaals afspelen begint opnieuw')
        check(wacht_op(lambda: tv.get_by_text('Benvenuti a').is_visible() and regia.get_by_role('button', name='Test: speel de uitnodiging af').is_visible(), 20), 'na afloop vanzelf terug naar het wachtscherm, ook in de Regia')
    else:
        # Deze testbrowser kan geen H.264 afspelen: dan moet de tv netjes terugvallen en de Regia het melden.
        check(wacht_op(lambda: 'kon niet afspelen op deze tv' in regia.inner_text('body')), 'regia meldt dat de tv de video niet kon afspelen')
        check(wacht_op(lambda: tv.get_by_text('Benvenuti a').is_visible()), 'tv valt terug op het wachtscherm')
        check(tv.evaluate('document.querySelector("video").src.slice(0, 5)') == 'blob:', 'tv probeerde de vooraf geladen blob')
        check(wacht_op(lambda: regia.get_by_role('button', name='Test: speel de uitnodiging af').is_visible()), 'regia-knop staat weer op afspelen')
        regia.screenshot(path=str(UIT / 'regia-4-videofout.png'))

    # ── verbinding weg en terug ──
    regia.context.set_offline(True)
    check(wacht_op(lambda: regia.get_by_text('Geen verbinding met de villa.', exact=False).is_visible(), 12), 'regia meldt: geen verbinding')
    regia.context.set_offline(False)
    check(wacht_op(lambda: not regia.get_by_text('Geen verbinding met de villa.', exact=False).is_visible(), 15), 'regia herstelt de verbinding vanzelf')
    regia.get_by_role('button', name='Open de deur').first.click()
    check(wacht_op(lambda: spelers[1].get_by_text('Het geheime archief · nu open').is_visible()), 'na herstel werkt de deurknop weer')
    regia.get_by_role('button', name='Sluit').first.click()

    # ── tv herladen: geen nieuwe koppeling nodig ──
    tv.reload()
    check(wacht_op(lambda: tv.get_by_text('Het scherm is gekoppeld').is_visible(), 10), 'tv na herladen meteen weer gekoppeld (alleen nog "Begin")')

    # ── de vier zegels van Il Pavone ──
    regia.get_by_role('button', name='Famiglia Morelli: nog niet bezegeld').click()
    check(wacht_op(lambda: regia.get_by_role('button', name='Famiglia Morelli: bezegeld').is_visible()), 'Regia: zegel van Morelli aangetikt')
    check(wacht_op(lambda: tv.evaluate('window.Villa.staat && window.Villa.staat.zegels && window.Villa.staat.zegels.morelli === true')), 'de tv weet het meteen')
    check(all(s.evaluate('window.Villa.staat && window.Villa.staat.zegels === undefined') for s in spelers[:2]), 'de telefoons van de spelers zien de zegels niet')
    regia.screenshot(path=str(UIT / 'regia-6-zegels.png'))
    regia.get_by_role('button', name='Famiglia Morelli: bezegeld').click()
    check(wacht_op(lambda: regia.get_by_role('button', name='Famiglia Morelli: nog niet bezegeld').is_visible()), 'Regia: zegel weer uit')

    # ── de finale-tabbladen mogen niet stuk gaan zonder antwoorden ──
    voor = len([l for l in logs if '[regia] pageerror' in l])
    for tab in ('Oordelen', 'Winnaar', 'Prijzen', 'Scherm'):
        regia.get_by_role('tab', name=tab).click()
        regia.wait_for_timeout(400)
    check(len([l for l in logs if '[regia] pageerror' in l]) == voor, 'alle tabbladen van de Regia openen zonder fouten (nog geen antwoorden)')
    check(regia.inner_text('body').count('0/15') >= 1, 'kop van de Regia telt 0/15 bezegeld')
    regia.screenshot(path=str(UIT / 'regia-5-scherm.png'))

    b.close()

print()
for l in logs:
    print('  log', l[:300])
print(f'\n{len(fouten)} FOUT(EN)' if fouten else '\nalles in orde')
sys.exit(1 if fouten else 0)
