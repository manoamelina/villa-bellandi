// Spelers, persoonlijke codes en de pincode van de Regia.
// Dit bestand draait alleen op de server; het komt nooit in public/ terecht.

export const SPELERS = [
  { id: 'alessandro', naam: 'Don Alessandro Caruso', voor: 'Alessandro' },
  { id: 'marco', naam: 'Marco Caruso', voor: 'Marco' },
  { id: 'luca', naam: 'Luca Caruso', voor: 'Luca' },
  { id: 'alessia', naam: 'Donna Alessia Bellaforte', voor: 'Alessia' },
  { id: 'raffaele', naam: 'Raffaele Bellaforte', voor: 'Raffaele' },
  { id: 'stefano', naam: 'Stefano Bellaforte', voor: 'Stefano' },
  { id: 'matteo', naam: 'Don Matteo Ventresca', voor: 'Matteo' },
  { id: 'enzo', naam: 'Enzo Ventresca', voor: 'Enzo' },
  { id: 'nico', naam: 'Nico Ventresca', voor: 'Nico' },
  { id: 'sofia', naam: 'Sofia Ventresca', voor: 'Sofia' },
  { id: 'salvatore', naam: 'Don Salvatore Morelli', voor: 'Salvatore' },
  { id: 'lucia', naam: 'Lucia Morelli', voor: 'Lucia' },
  { id: 'giulia', naam: 'Giulia Morelli', voor: 'Giulia' },
  { id: 'sebastiano', naam: 'Sebastiano Valenti', voor: 'Sebastiano' },
  { id: 'caterina', naam: 'Avvocata Caterina Rinaldi', voor: 'Caterina' },
];

// De code uit de envelop van elke speler (6 tekens, zonder 0, 1, I, L en O).
export const CODES = {
  'ZV45Y5': 'alessandro',
  '9UR4XY': 'marco',
  '6PE4AY': 'luca',
  '75BR77': 'alessia',
  'G8ZEEN': 'raffaele',
  'SS5N2G': 'stefano',
  'QDZ6EW': 'matteo',
  'YFSHD7': 'enzo',
  'J4JRCJ': 'nico',
  'FUAV42': 'sofia',
  'TFQA5X': 'salvatore',
  'PGVY35': 'lucia',
  '2SDJVU': 'giulia',
  'GF7J3P': 'sebastiano',
  'NNT67B': 'caterina',
};

// Alleen Donna Serafina kent deze pincode.
export const REGIA_PIN = '865898';

// De video's die de tv kan afspelen (bestanden staan in public/media/).
export const VIDEOS = {
  uitnodiging: { titel: 'De uitnodiging', bestand: '/media/uitnodiging.mp4' },
};

export const DEUREN = ['archivio', 'sala'];

export function normCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function spelerBijCode(code) {
  const id = CODES[normCode(code)];
  return id ? SPELERS.find((s) => s.id === id) || null : null;
}
