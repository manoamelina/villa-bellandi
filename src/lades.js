// Gemaakt door tools/bouw_app.py uit het ontwerp (concept/project/Archivio.dc.html): pas de lades daar aan.
// Dit bestand draait alleen op de server; de antwoorden komen nooit in public/ terecht.
export const LADES = [
  {
    "n": "I",
    "naam": "Il Decreto",
    "vraag": "Hoeveel dagen vóór het bewijs tegen Francesco Falcone lag zijn bezit al verdeeld?",
    "antwoord": 2,
    "tip": "Vergelijk de datum op het decreet over het Falcone-bezit met de datum in het officiële rapport over Francesco.",
    "regel": "Twee dagen. Het oordeel over Falcone lag klaar voordat er een misdaad was."
  },
  {
    "n": "II",
    "naam": "Il Veleno",
    "vraag": "Hoeveel keer zo sterk als zijn recept was wat er in Vittorio’s potje zat?",
    "antwoord": 8,
    "tip": "Wat schreef de dokter voor, en wat zat er werkelijk in het potje? Het dossier en het potje liggen bij verschillende mensen.",
    "regel": "Acht keer zijn dosis, in het potje dat hij al jaren vertrouwde."
  },
  {
    "n": "III",
    "naam": "Il Pagamento",
    "vraag": "Hoe vaak werd Gabriele Conti betaald voordat hij de lampolie ophaalde?",
    "antwoord": 3,
    "tip": "Leg de betalingen aan Conti naast het havenregister van de lampolie, en tel.",
    "regel": "Drie betalingen. Conti was al betaald voordat hij de lampolie ophaalde."
  }
];
export const KLEM = 15;          // seconden extra per foute poging
export const MAX_KLEM = 120;     // langste wachttijd
