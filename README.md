# Villa Bellandi — de app

De app voor *The Bellandi Archives*, de moordmysterie-avond van Friendsgiving (zaterdag 21 november 2026).
Hij draait op Cloudflare (gratis): elke push naar `main` wordt vanzelf gebouwd en online gezet.

## Adressen

| Adres | Voor wie |
|---|---|
| `/` | De spelers: de voordeur, daarna de foyer. Inloggen met de code uit de envelop. |
| `/regia` | Donna Serafina: deuren openen, de tv bedienen, de finale. Alleen met de pincode. |
| `/tv` | De tv in de woonkamer. Koppelt zich één keer via een code die je in de Regia invult. |

## Hoe het in elkaar zit

- `public/` — alle pagina's, beelden en video's. Gebouwd uit het ontwerp met `tools/bouw_app.py`, niet met de hand aanpassen.
- `public/live.js` — de live verbinding in de browser (opnieuw verbinden, aanmelden, video's vooraf laden).
- `src/worker.js` — de ingang: `/live` is de live verbinding, al het andere zijn bestanden uit `public/`.
- `src/villa.js` — de villa zelf (één Durable Object): deuren, tv, wie er binnen is. Bewaart alles, ook als de server herstart.
- `src/spel.js` — spelers, envelopcodes en de pincode van de Regia. Staat alleen op de server, nooit in `public/`.

Wat de oplossing verraadt, komt niet in `public/`: het bouwscript controleert dat bij elke bouw.
De Sala en het Archivio zijn in deze versie nog tussenpagina's; die worden in een volgende versie live.

## Testen

```sh
WORKERD=/pad/naar/workerd sh test/herstart.sh   # draait de Worker lokaal met workerd op poort 8790
node test/rook.mjs              # test de server: aanmelden, koppelen, deuren, tv
python3 test/e2e.py --webm      # tv, Regia en drie telefoons in een echte browser
```
