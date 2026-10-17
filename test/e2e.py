"""End-to-end test van de eerste versie: tv, Regia en drie telefoons tegen de lokale Worker (poort 8790).
Gebruik: python3 villa/test/e2e.py [uitmap-voor-schermafbeeldingen]"""
import re
import subprocess
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


subprocess.run(['node', str(Path(__file__).resolve().parent / 'opnieuw.mjs')], check=True)   # elke run begint schoon

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=document-user-activation-required'])
    tv = nieuw(b, 'tv', 1920, 1080, False)
    op_wacht = lambda: tv.get_by_text('La Sentenza').first.is_visible()   # de tijdlijn onderaan staat alleen op het wachtscherm
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
    check(wacht_op(op_wacht), 'tv toont het wachtscherm na OK')
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
    regia.get_by_role('button', name='Sluit', exact=True).first.click()
    check(wacht_op(lambda: all(not s.get_by_text('Het geheime archief · nu open').is_visible() for s in spelers)), 'archief gaat weer dicht op alle telefoons')

    # ── de fase van de avond ──
    check(wacht_op(lambda: tv.get_by_text('Het archief', exact=True).is_visible()), 'archief openen zette de tv op fase IV, L’Archivio')
    check(tv.get_by_text('Het archief', exact=True).is_visible(), 'de fase blijft staan als de deur weer dicht gaat')
    tv.screenshot(path=str(UIT / 'tv-5-fase.png'))
    regia.get_by_role('button', name='Vorige fase', exact=True).click()
    check(wacht_op(lambda: tv.get_by_text('De geheimen', exact=True).is_visible()), 'Regia: Vorige zet de tv op I Segreti')
    regia.get_by_role('button', name='Volgende fase').click()
    check(wacht_op(lambda: tv.get_by_text('Het archief', exact=True).is_visible()), 'Regia: Volgende fase zet de tv weer op L’Archivio')
    check(all(s.evaluate('window.Villa.staat && window.Villa.staat.fase === undefined') for s in spelers[:2]), 'de telefoons van de spelers krijgen de fase niet')

    # ── het archief: de zes op één telefoon, de zaal kijkt mee op de tv ──
    regia.get_by_role('button', name='Open de deur').first.click()
    check(wacht_op(lambda: spelers[0].get_by_text('Het geheime archief · nu open').is_visible()), 'archief weer open')
    a = spelers[0]   # Don Alessandro, familiehoofd
    a.goto(BASIS + '/Archivio.dc.html')
    naar_bureau = a.get_by_role('button', name='Loop naar het bureau van Don Vittorio')
    check(wacht_op(lambda: naar_bureau.is_visible(), 10), 'Alessandro komt in het archief')
    naar_bureau.click(); a.wait_for_timeout(2500)
    a.get_by_role('button', name='Lade I, Il Decreto, verzegeld').click(); a.wait_for_timeout(500)
    a.get_by_role('button', name='Cijfer 5').click()
    a.get_by_role('button', name='Probeer het slot').click()
    check(wacht_op(lambda: a.get_by_text('Het slot geeft niet mee.').is_visible()), 'fout cijfer: het slot geeft niet mee')
    check(wacht_op(lambda: 'Het klemt nog 0:1' in a.inner_text('body')), 'het slot klemt 15 seconden')
    check(wacht_op(lambda: '1 foute poging' in regia.inner_text('body') and 'klemt nog 0:1' in regia.inner_text('body')), 'Regia ziet de foute poging en de wachttijd')
    check(wacht_op(lambda: tv.get_by_text('het slot klemt nog', exact=False).is_visible()), 'de tv toont dat lade I klemt')
    a.screenshot(path=str(UIT / 'archief-1-fout.png'))
    tv.screenshot(path=str(UIT / 'tv-6-archief-fout.png'))
    a.get_by_role('button', name='Sluiten').click(); a.wait_for_timeout(500)
    regia.get_by_role('button', name='Stuur de hint voor lade II', exact=True).click()
    a.get_by_role('button', name='Lade II, Il Veleno, verzegeld').click(); a.wait_for_timeout(500)
    check(wacht_op(lambda: a.get_by_text('Hint van Donna Serafina').is_visible()), 'de hint verschijnt op de archieftelefoon')
    check(wacht_op(lambda: tv.get_by_text('Hint van Donna Serafina').is_visible()), 'en op de tv')
    a.get_by_role('button', name='Cijfer 8').click()
    a.get_by_role('button', name='Probeer het slot').click()
    check(wacht_op(lambda: a.get_by_text('Acht keer zijn dosis', exact=False).first.is_visible()), 'goed cijfer: lade II gaat open, met de onthulling')
    check(wacht_op(lambda: 'toxicologisch rapport' in regia.inner_text('body')), 'Regia: deel nu het toxicologisch rapport uit')
    check(wacht_op(lambda: tv.get_by_text('Acht keer zijn dosis', exact=False).is_visible()), 'de tv toont lade II open')
    tv.screenshot(path=str(UIT / 'tv-7-archief-open.png'))
    regia.get_by_role('button', name='Open lade III zelf').click()
    regia.get_by_role('button', name='Open lade I zelf').click()
    check(wacht_op(lambda: a.get_by_text('L’archivio è aperto').is_visible(), 10), 'alle drie open: de kist op de telefoon')
    check('2 · 8 · 3' in a.inner_text('body'), 'de code van de kist is 2 · 8 · 3')
    check(wacht_op(lambda: tv.get_by_text('La cassa si apre con', exact=False).is_visible()), 'de tv toont de code van de kist')
    check(wacht_op(lambda: 'De kist gaat open met 2 · 8 · 3' in regia.inner_text('body')), 'Regia: de kist gaat open met 2 · 8 · 3')
    a.screenshot(path=str(UIT / 'archief-2-kist.png'))
    tv.screenshot(path=str(UIT / 'tv-8-archief-kist.png'))
    regia.screenshot(path=str(UIT / 'regia-7-archief.png'))
    m = spelers[1]   # Marco mag niet in het archief
    m.goto(BASIS + '/Archivio.dc.html')
    check(wacht_op(lambda: m.get_by_text('Het archief is open voor de familiehoofden', exact=False).is_visible(), 10), 'Marco ziet: het archief is voor de familiehoofden, kijk mee op de tv')
    check('Acht keer' not in m.content() and 'Twee dagen' not in m.content(), 'Marco’s pagina bevat geen onthulling')
    m.screenshot(path=str(UIT / 'archief-3-marco.png'))
    for n in ('I', 'II', 'III'):
        regia.get_by_role('button', name=f'Sluit lade {n} zelf').click()
    check(wacht_op(lambda: '0 van 3 open' in regia.inner_text('body')), 'Regia sluit de lades weer')
    regia.get_by_role('button', name='Sluit', exact=True).first.click()
    m.goto(BASIS + '/Foyer.dc.html')

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
        check(wacht_op(lambda: op_wacht() and tv.evaluate('document.querySelector("video").paused')), 'stop: tv terug naar het wachtscherm')
        regia.get_by_role('button', name='Test: speel de uitnodiging af').click()
        check(wacht_op(lambda: not tv.evaluate('document.querySelector("video").paused')), 'nogmaals afspelen begint opnieuw')
        check(wacht_op(lambda: op_wacht() and regia.get_by_role('button', name='Test: speel de uitnodiging af').is_visible(), 20), 'na afloop vanzelf terug naar het wachtscherm, ook in de Regia')
    else:
        # Deze testbrowser kan geen H.264 afspelen: dan moet de tv netjes terugvallen en de Regia het melden.
        check(wacht_op(lambda: 'kon niet afspelen op deze tv' in regia.inner_text('body')), 'regia meldt dat de tv de video niet kon afspelen')
        check(wacht_op(op_wacht), 'tv valt terug op het wachtscherm')
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
    regia.get_by_role('button', name='Sluit', exact=True).first.click()

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

    # ── opnieuw beginnen: na een proefronde alles in één keer terug ──
    tv.keyboard.press('Enter')   # na het herladen staat de tv nog op "Begin"
    check(wacht_op(op_wacht), 'tv weer op het wachtscherm')
    # eerst de avond op fase IV met het archief open, zoals midden in een proefronde
    fasen = ['benvenuto', 'riunione', 'segreti', 'archivio', 'sala', 'sentenza']
    tv_fase = lambda: tv.evaluate('window.Villa.staat && window.Villa.staat.fase')
    for _ in range(6):
        f = tv_fase()
        if f == 'archivio':
            break
        regia.get_by_role('button', name='Vorige fase' if fasen.index(f) > 3 else 'Volgende fase', exact=True).click()
        wacht_op(lambda: tv_fase() != f, 3)
    if not tv.evaluate('window.Villa.staat.deuren.archivio'):
        regia.get_by_role('button', name='Open de deur').first.click()   # het archief staat als eerste deur in de lijst
    check(wacht_op(lambda: 'cassetto' in tv.inner_text('body').lower()), 'voor het terugzetten: fase IV, archief open, de tv toont de lades')
    regia.get_by_role('button', name='Famiglia Caruso: nog niet bezegeld').click()
    regia.get_by_role('button', name='Stuur de hint voor lade I', exact=True).click()
    regia.get_by_role('button', name='Open lade III zelf').click()
    check(wacht_op(lambda: '1 van 3 open' in regia.inner_text('body') and regia.get_by_role('button', name='Famiglia Caruso: bezegeld').is_visible()
                   and regia.get_by_role('button', name='Haal de hint weg bij lade I', exact=True).is_visible()), 'lade III open, hint bij lade I, zegel van Caruso')
    regia.get_by_role('button', name='Zet alles terug').click()
    groep = regia.get_by_role('group', name='Alles terugzetten?')
    check(wacht_op(lambda: groep.is_visible()), 'Regia vraagt eerst: alles terugzetten?')
    regia.wait_for_timeout(300)
    check(groep.evaluate('el => el.getBoundingClientRect().bottom <= window.innerHeight - 74 + 1'), 'het vak staat helemaal in beeld, boven de tabbalk')
    regia.screenshot(path=str(UIT / 'regia-7-opnieuw.png'))
    groep.get_by_role('button', name='Annuleer').click()
    check(wacht_op(lambda: not groep.is_visible()) and '1 van 3 open' in regia.inner_text('body'), 'Annuleer laat alles staan')
    regia.get_by_role('button', name='Zet alles terug').click()
    groep.get_by_role('button', name='Ja, zet alles terug').click()
    check(wacht_op(lambda: regia.get_by_text('Alles staat weer op het begin.').is_visible()), 'Regia: alles staat weer op het begin')
    check(wacht_op(lambda: '0 van 3 open' in regia.inner_text('body') and 'Il Benvenuto' in regia.inner_text('body')), 'Regia: fase I, alle lades dicht')
    check(regia.get_by_role('button', name='Famiglia Caruso: nog niet bezegeld').is_visible(), 'Regia: de zegels van Il Pavone zijn weer leeg')
    check(regia.get_by_role('button', name='Stuur de hint voor lade I', exact=True).is_visible(), 'Regia: de hint is weg')
    check(len(regia.get_by_role('button', name='Open de deur').all()) == 2, 'Regia: beide deuren weer dicht')
    check(wacht_op(lambda: tv_fase() == 'benvenuto' and 'Villa Bellandi' in tv.inner_text('body') and 'cassetto' not in tv.inner_text('body').lower()),
          'de tv staat weer op fase I: Benvenuti a Villa Bellandi, geen lades meer')
    check(tv.evaluate('window.Villa.staat.archief.open.every(o => !o) && window.Villa.staat.archief.tips.every(t => !t)'), 'de tv: lades dicht, geen hint')
    check(wacht_op(lambda: all(not s.get_by_text('Het geheime archief · nu open').is_visible() for s in spelers)), 'het archief is weer dicht op de telefoons')
    check(regia.get_by_text('Tv gekoppeld').is_visible(), 'de tv blijft gekoppeld')
    check('3' in regia.locator('text=van 15').first.locator('..').inner_text(), 'de spelers blijven ingelogd (3 van 15 binnen)')
    check(wacht_op(lambda: not regia.get_by_text('Alles staat weer op het begin.').is_visible(), 10), 'de melding verdwijnt vanzelf')

    # ── uitloggen: een speler, via het overzicht van alle ruimtes in de foyer ──
    s = spelers[2]
    s.goto(BASIS + '/Foyer.dc.html')
    check(wacht_op(lambda: s.get_by_role('button', name='Overzicht van alle ruimtes').is_visible(), 10), 'speler in de foyer')
    s.get_by_role('button', name='Overzicht van alle ruimtes').click()
    check(wacht_op(lambda: s.get_by_text('Ingelogd als').is_visible() and CODES[2][1].capitalize() in s.inner_text('body')), 'het overzicht toont: ingelogd als ' + CODES[2][1].capitalize())
    s.get_by_role('button', name='Uitloggen', exact=True).click()
    vraag = s.get_by_role('group', name='Uitloggen?')
    check(wacht_op(lambda: vraag.is_visible()), 'eerst de vraag: uitloggen?')
    s.screenshot(path=str(UIT / 'speler-3-uitloggen.png'))
    vraag.get_by_role('button', name='Blijf').click()
    check(wacht_op(lambda: not vraag.is_visible()) and s.evaluate("localStorage.getItem('villa-code')") is not None, 'Blijf laat je ingelogd')
    s.get_by_role('button', name='Uitloggen', exact=True).click()
    vraag.get_by_role('button', name='Log uit').click()
    check(wacht_op(lambda: s.url.endswith('/Entree.dc.html') and s.get_by_text("CODICE D'ACCESSO").is_visible(), 10), 'na uitloggen sta je weer bij de voordeur')
    check(s.evaluate("localStorage.getItem('villa-code')") is None and s.input_value('#toegang') == '', 'de code is vergeten en het codeveld is leeg')
    check(wacht_op(lambda: '2' in regia.locator('text=van 15').first.locator('..').inner_text()), 'de Regia telt nog 2 van 15 binnen')
    s.goto(BASIS + '/Galleria.dc.html')
    check(wacht_op(lambda: s.url.endswith('/Entree.dc.html'), 10), 'zonder code stuurt een kamer je terug naar de voordeur')

    # ── uitloggen: de Regia ──
    oud_token = regia.evaluate("localStorage.getItem('villa-regia')")
    regia.get_by_role('tab', name='Scherm').click()
    regia.get_by_role('button', name='Uitloggen', exact=True).click()
    check(wacht_op(lambda: regia.get_by_text('Alleen voor Donna Serafina').is_visible(), 10), 'Regia uitgelogd: de pincode wordt weer gevraagd')
    check(regia.evaluate("localStorage.getItem('villa-regia')") is None, 'de Regia is zijn toegang vergeten')
    regia.fill('#regia-pin', PIN)
    regia.get_by_role('button', name='Open de Regia').click()
    check(wacht_op(lambda: not regia.get_by_text('Alleen voor Donna Serafina').is_visible(), 10), 'met de pincode weer binnen')
    check(regia.evaluate("localStorage.getItem('villa-regia')") not in (None, oud_token), 'met een nieuwe toegang')

    b.close()

print()
for l in logs:
    print('  log', l[:300])
print(f'\n{len(fouten)} FOUT(EN)' if fouten else '\nalles in orde')
sys.exit(1 if fouten else 0)
