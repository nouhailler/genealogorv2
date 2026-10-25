/**
 * Convertisseur pour le calendrier républicain français (1792 - 1805)
 * Indispensable pour les archives d'état civil de la Révolution et de l'Empire.
 */

export const REPUBLICAN_MONTHS = [
  'Vendémiaire', 'Brumaire', 'Frimaire',
  'Nivôse', 'Pluviôse', 'Ventôse',
  'Germinal', 'Floréal', 'Prairial',
  'Messidor', 'Thermidor', 'Fructidor',
  'Sansculottides'
];

export const ROMAN_NUMERALS: Record<number, string> = {
  1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII',
  8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII', 13: 'XIII', 14: 'XIV'
};

// Dates de début d'année républicaine dans le calendrier grégorien
const REPUBLICAN_NEW_YEARS: Record<number, { year: number; month: number; day: number }> = {
  1: { year: 1792, month: 9, day: 22 },
  2: { year: 1793, month: 9, day: 22 },
  3: { year: 1794, month: 9, day: 22 },
  4: { year: 1795, month: 9, day: 23 },
  5: { year: 1796, month: 9, day: 22 },
  6: { year: 1797, month: 9, day: 22 },
  7: { year: 1798, month: 9, day: 22 },
  8: { year: 1799, month: 9, day: 23 },
  9: { year: 1800, month: 9, day: 23 },
  10: { year: 1801, month: 9, day: 23 },
  11: { year: 1802, month: 9, day: 23 },
  12: { year: 1803, month: 9, day: 24 },
  13: { year: 1804, month: 9, day: 23 },
  14: { year: 1805, month: 9, day: 23 },
};

export function parseRepublicanDate(dateStr: string): { gregorianApprox?: string; isValid: boolean } {
  if (!dateStr) return { isValid: false };
  const str = dateStr.trim();

  // Pattern ex: "14 Brumaire an II" ou "1er Vendémiaire an IV" ou "22 Frimaire XII"
  const regex = /(\d+|1er)?\s+([A-Za-zÀ-ÿ]+)\s+(?:an\s+)?([IVXLCDM]+|\d+)/i;
  const match = str.match(regex);

  if (!match) return { isValid: false };

  let day = match[1] ? (match[1].toLowerCase() === '1er' ? 1 : parseInt(match[1], 10)) : 1;
  const monthName = match[2].toLowerCase();
  let yearNum = 0;

  const romanMatch = match[3].toUpperCase();
  for (const [num, roman] of Object.entries(ROMAN_NUMERALS)) {
    if (roman === romanMatch) {
      yearNum = parseInt(num, 10);
      break;
    }
  }
  if (!yearNum) {
    yearNum = parseInt(match[3], 10);
  }

  const monthIndex = REPUBLICAN_MONTHS.findIndex(
    m => m.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") ===
         monthName.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );

  if (monthIndex === -1 || !yearNum || !REPUBLICAN_NEW_YEARS[yearNum]) {
    return { isValid: false };
  }

  const start = REPUBLICAN_NEW_YEARS[yearNum];
  const startDate = new Date(Date.UTC(start.year, start.month - 1, start.day));
  
  // Chaque mois républicain compte 30 jours, suivi des jours complémentaires (sansculottides)
  const daysToAdd = (monthIndex * 30) + (day - 1);
  startDate.setUTCDate(startDate.getUTCDate() + daysToAdd);

  const d = startDate.getUTCDate().toString().padStart(2, '0');
  const m = (startDate.getUTCMonth() + 1).toString().padStart(2, '0');
  const y = startDate.getUTCFullYear();

  return {
    gregorianApprox: `${d}/${m}/${y}`,
    isValid: true
  };
}
