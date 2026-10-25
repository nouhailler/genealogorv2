/**
 * Dictionnaire de géocodage et résolveur cartographique OpenStreetMap
 * optimisé pour la généalogie française (paroisses, communes, départements).
 */

import { extractDept, deptName, region as deptRegion, normalize as normalizeName } from './place-gazetteer';

export interface GeoCoordinates {
  lat: number;
  lng: number;
  source?: 'dictionary' | 'cache' | 'osm_api';
  /** Nom officiel de la commune trouvée (ex. « Saint-Pierre-de-Frugie » pour le lieu-dit « Verdenille, 24486 ») */
  name?: string;
  department?: string;
  region?: string;
}

// Coordonnées de référence des communes, villes et préfectures françaises
const KNOWN_FRENCH_PLACES: Record<string, GeoCoordinates> = {
  // Bretagne & Ouest
  'saint-malo': { lat: 48.6493, lng: -2.0257, department: 'Ille-et-Vilaine', region: 'Bretagne' },
  'rennes': { lat: 48.1173, lng: -1.6778, department: 'Ille-et-Vilaine', region: 'Bretagne' },
  'cancale': { lat: 48.6774, lng: -1.8519, department: 'Ille-et-Vilaine', region: 'Bretagne' },
  'dinan': { lat: 48.4559, lng: -2.0483, department: 'Côtes-d\'Armor', region: 'Bretagne' },
  'nantes': { lat: 47.2184, lng: -1.5536, department: 'Loire-Atlantique', region: 'Pays de la Loire' },
  'brest': { lat: 48.3904, lng: -4.4861, department: 'Finistère', region: 'Bretagne' },
  'quimper': { lat: 47.9975, lng: -4.0979, department: 'Finistère', region: 'Bretagne' },
  'vannes': { lat: 47.6582, lng: -2.7608, department: 'Morbihan', region: 'Bretagne' },
  'lorient': { lat: 47.7483, lng: -3.3702, department: 'Morbihan', region: 'Bretagne' },
  'saint-brieuc': { lat: 48.5142, lng: -2.7658, department: 'Côtes-d\'Armor', region: 'Bretagne' },
  'fougeres': { lat: 48.3516, lng: -1.2007, department: 'Ille-et-Vilaine', region: 'Bretagne' },
  'redon': { lat: 47.6525, lng: -2.0853, department: 'Ille-et-Vilaine', region: 'Bretagne' },
  'dinard': { lat: 48.6328, lng: -2.0624, department: 'Ille-et-Vilaine', region: 'Bretagne' },
  'dol-de-bretagne': { lat: 48.5503, lng: -1.7516, department: 'Ille-et-Vilaine', region: 'Bretagne' },
  'saint-coulomb': { lat: 48.6756, lng: -1.9122, department: 'Ille-et-Vilaine', region: 'Bretagne' },
  'morlaix': { lat: 48.5779, lng: -3.8286, department: 'Finistère', region: 'Bretagne' },
  'lannion': { lat: 48.7323, lng: -3.4566, department: 'Côtes-d\'Armor', region: 'Bretagne' },
  'lamballe': { lat: 48.4703, lng: -2.5186, department: 'Côtes-d\'Armor', region: 'Bretagne' },
  'pontivy': { lat: 48.0689, lng: -2.9664, department: 'Morbihan', region: 'Bretagne' },
  'ploermel': { lat: 47.9331, lng: -2.3986, department: 'Morbihan', region: 'Bretagne' },
  'chateaubriant': { lat: 47.7189, lng: -1.3764, department: 'Loire-Atlantique', region: 'Pays de la Loire' },
  'saint-nazaire': { lat: 47.2736, lng: -2.2137, department: 'Loire-Atlantique', region: 'Pays de la Loire' },
  'angers': { lat: 47.4784, lng: -0.5632, department: 'Maine-et-Loire', region: 'Pays de la Loire' },
  'saumur': { lat: 47.2600, lng: -0.0768, department: 'Maine-et-Loire', region: 'Pays de la Loire' },
  'laval': { lat: 48.0734, lng: -0.7686, department: 'Mayenne', region: 'Pays de la Loire' },
  'le mans': { lat: 48.0061, lng: 0.1996, department: 'Sarthe', region: 'Pays de la Loire' },
  'tours': { lat: 47.3941, lng: 0.6848, department: 'Indre-et-Loire', region: 'Centre-Val de Loire' },
  'poitiers': { lat: 46.5802, lng: 0.3404, department: 'Vienne', region: 'Nouvelle-Aquitaine' },
  'la rochelle': { lat: 46.1603, lng: -1.1511, department: 'Charente-Maritime', region: 'Nouvelle-Aquitaine' },
  'niort': { lat: 46.3231, lng: -0.4588, department: 'Deux-Sèvres', region: 'Nouvelle-Aquitaine' },
  'saintes': { lat: 45.7464, lng: -0.6332, department: 'Charente-Maritime', region: 'Nouvelle-Aquitaine' },

  // Île-de-France & Nord
  'paris': { lat: 48.8566, lng: 2.3522, department: 'Paris', region: 'Île-de-France' },
  'versailles': { lat: 48.8049, lng: 2.1204, department: 'Yvelines', region: 'Île-de-France' },
  'saint-denis': { lat: 48.9362, lng: 2.3574, department: 'Seine-Saint-Denis', region: 'Île-de-France' },
  'boulogne-billancourt': { lat: 48.8397, lng: 2.2399, department: 'Hauts-de-Seine', region: 'Île-de-France' },
  'lille': { lat: 50.6292, lng: 3.0573, department: 'Nord', region: 'Hauts-de-France' },
  'rouen': { lat: 49.4432, lng: 1.0999, department: 'Seine-Maritime', region: 'Normandie' },
  'caen': { lat: 49.1829, lng: -0.3707, department: 'Calvados', region: 'Normandie' },
  'le havre': { lat: 49.4944, lng: 0.1079, department: 'Seine-Maritime', region: 'Normandie' },
  'amiens': { lat: 49.8941, lng: 2.2958, department: 'Somme', region: 'Hauts-de-France' },
  'arras': { lat: 50.2910, lng: 2.7775, department: 'Pas-de-Calais', region: 'Hauts-de-France' },
  'dunkerque': { lat: 51.0343, lng: 2.3768, department: 'Nord', region: 'Hauts-de-France' },
  'cherbourg': { lat: 49.6337, lng: -1.6222, department: 'Manche', region: 'Normandie' },
  'alencon': { lat: 48.4329, lng: 0.0913, department: 'Orne', region: 'Normandie' },

  // Est & Centre
  'strasbourg': { lat: 48.5734, lng: 7.7521, department: 'Bas-Rhin', region: 'Grand Est' },
  'metz': { lat: 49.1193, lng: 6.1757, department: 'Moselle', region: 'Grand Est' },
  'nancy': { lat: 48.6921, lng: 6.1844, department: 'Meurthe-et-Moselle', region: 'Grand Est' },
  'reims': { lat: 49.2583, lng: 4.0317, department: 'Marne', region: 'Grand Est' },
  'mulhouse': { lat: 47.7508, lng: 7.3359, department: 'Haut-Rhin', region: 'Grand Est' },
  'dijon': { lat: 47.3220, lng: 5.0415, department: 'Côte-d\'Or', region: 'Bourgogne-Franche-Comté' },
  'besancon': { lat: 47.2378, lng: 6.0241, department: 'Doubs', region: 'Bourgogne-Franche-Comté' },
  'orleans': { lat: 47.9029, lng: 1.9093, department: 'Loiret', region: 'Centre-Val de Loire' },
  'bourges': { lat: 47.0810, lng: 2.3988, department: 'Cher', region: 'Centre-Val de Loire' },
  'chartres': { lat: 48.4439, lng: 1.4890, department: 'Eure-et-Loir', region: 'Centre-Val de Loire' },
  'chateauroux': { lat: 46.8115, lng: 1.6987, department: 'Indre', region: 'Centre-Val de Loire' },
  'blois': { lat: 47.5861, lng: 1.3359, department: 'Loir-et-Cher', region: 'Centre-Val de Loire' },
  'auxerre': { lat: 47.7985, lng: 3.5738, department: 'Yonne', region: 'Bourgogne-Franche-Comté' },

  // Auvergne-Rhône-Alpes
  'lyon': { lat: 45.7640, lng: 4.8357, department: 'Rhône', region: 'Auvergne-Rhône-Alpes' },
  'grenoble': { lat: 45.1885, lng: 5.7245, department: 'Isère', region: 'Auvergne-Rhône-Alpes' },
  'saint-etienne': { lat: 45.4397, lng: 4.3872, department: 'Loire', region: 'Auvergne-Rhône-Alpes' },
  'clermont-ferrand': { lat: 45.7772, lng: 3.0870, department: 'Puy-de-Dôme', region: 'Auvergne-Rhône-Alpes' },
  'annecy': { lat: 45.8992, lng: 6.1294, department: 'Haute-Savoie', region: 'Auvergne-Rhône-Alpes' },
  'chambery': { lat: 45.5646, lng: 5.9178, department: 'Savoie', region: 'Auvergne-Rhône-Alpes' },
  'valence': { lat: 44.9334, lng: 4.8924, department: 'Drôme', region: 'Auvergne-Rhône-Alpes' },
  'aurillac': { lat: 44.9261, lng: 2.4452, department: 'Cantal', region: 'Auvergne-Rhône-Alpes' },
  'bourg-en-bresse': { lat: 46.2052, lng: 5.2258, department: 'Ain', region: 'Auvergne-Rhône-Alpes' },
  'vichy': { lat: 46.1278, lng: 3.4267, department: 'Allier', region: 'Auvergne-Rhône-Alpes' },

  // Sud-Ouest & Occitanie
  'bordeaux': { lat: 44.8378, lng: -0.5792, department: 'Gironde', region: 'Nouvelle-Aquitaine' },
  'toulouse': { lat: 43.6047, lng: 1.4442, department: 'Haute-Garonne', region: 'Occitanie' },
  'montpellier': { lat: 43.6108, lng: 3.8767, department: 'Hérault', region: 'Occitanie' },
  'nimes': { lat: 43.8367, lng: 4.3601, department: 'Gard', region: 'Occitanie' },
  'perpignan': { lat: 42.6887, lng: 2.8948, department: 'Pyrénées-Orientales', region: 'Occitanie' },
  'pau': { lat: 43.2951, lng: -0.3708, department: 'Pyrénées-Atlantiques', region: 'Nouvelle-Aquitaine' },
  'bayonne': { lat: 43.4929, lng: -1.4748, department: 'Pyrénées-Atlantiques', region: 'Nouvelle-Aquitaine' },
  'biarritz': { lat: 43.4832, lng: -1.5586, department: 'Pyrénées-Atlantiques', region: 'Nouvelle-Aquitaine' },
  'limoges': { lat: 45.8336, lng: 1.2611, department: 'Haute-Vienne', region: 'Nouvelle-Aquitaine' },
  'angouleme': { lat: 45.6484, lng: 0.1562, department: 'Charente', region: 'Nouvelle-Aquitaine' },
  'agen': { lat: 44.2031, lng: 0.6164, department: 'Lot-et-Garonne', region: 'Nouvelle-Aquitaine' },
  'montauban': { lat: 44.0178, lng: 1.3550, department: 'Tarn-et-Garonne', region: 'Occitanie' },
  'albi': { lat: 43.9284, lng: 2.1480, department: 'Tarn', region: 'Occitanie' },
  'tarbes': { lat: 43.2329, lng: 0.0781, department: 'Hautes-Pyrénées', region: 'Occitanie' },
  'carcassonne': { lat: 43.2122, lng: 2.3537, department: 'Aude', region: 'Occitanie' },
  'rodez': { lat: 44.3517, lng: 2.5750, department: 'Aveyron', region: 'Occitanie' },
  'cahors': { lat: 44.4475, lng: 1.4419, department: 'Lot', region: 'Occitanie' },
  'perigueux': { lat: 45.1839, lng: 0.7217, department: 'Dordogne', region: 'Nouvelle-Aquitaine' },

  // Sud-Est & PACA
  'marseille': { lat: 43.2965, lng: 5.3698, department: 'Bouches-du-Rhône', region: 'PACA' },
  'nice': { lat: 43.7102, lng: 7.2620, department: 'Alpes-Maritimes', region: 'PACA' },
  'toulon': { lat: 43.1242, lng: 5.9280, department: 'Var', region: 'PACA' },
  'aix-en-provence': { lat: 43.5297, lng: 5.4474, department: 'Bouches-du-Rhône', region: 'PACA' },
  'avignon': { lat: 43.9493, lng: 4.8055, department: 'Vaucluse', region: 'PACA' },
  'cannes': { lat: 43.5528, lng: 7.0174, department: 'Alpes-Maritimes', region: 'PACA' },
  'arles': { lat: 43.6766, lng: 4.6306, department: 'Bouches-du-Rhône', region: 'PACA' },
  'gap': { lat: 44.5596, lng: 6.0798, department: 'Hautes-Alpes', region: 'PACA' },
  'digne-les-bains': { lat: 44.0922, lng: 6.2361, department: 'Alpes-de-Haute-Provence', region: 'PACA' },
  'ajaccio': { lat: 41.9192, lng: 8.7386, department: 'Corse-du-Sud', region: 'Corse' },
  'bastia': { lat: 42.6973, lng: 9.4509, department: 'Haute-Corse', region: 'Corse' },
};

// Cache local des résultats de géocodage, indexé par lieu complet (le résultat dépend du code et du département).
// La version 2 contenait des positions fausses (correspondances partielles, homonymes d'outre-mer) : elle est abandonnée.
const GEOCACHE_STORAGE_KEY = 'genealogor_geocache_v3';
const LEGACY_GEOCACHE_KEYS = ['genealogor_geocache_v2'];

function getPersistentCache(): Record<string, GeoCoordinates> {
  if (typeof localStorage === 'undefined') return {};
  try {
    for (const key of LEGACY_GEOCACHE_KEYS) localStorage.removeItem(key);
    const raw = localStorage.getItem(GEOCACHE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function savePersistentCache(key: string, coords: GeoCoordinates) {
  if (typeof localStorage === 'undefined') return;
  try {
    const cache = getPersistentCache();
    cache[key] = coords;
    localStorage.setItem(GEOCACHE_STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {}
}

/**
 * Normalise le nom d'un lieu (minuscules, sans accents, sans ponctuations parasites)
 */
export function normalizePlaceKey(place: string): string {
  if (!place) return '';
  return place
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface ParsedPlace {
  /** Commune (sans lieu-dit ni code) */
  commune: string;
  /** Lieu-dit ou hameau éventuel (« Bas Ribeyreix - Saint-Priest… », « Curmont, La Coquille, … ») */
  hamlet?: string;
  /** Code à 5 chiffres présent dans le lieu : code INSEE (Geneanet, Heredis) ou code postal */
  code?: string;
  /** Code département déduit du code ou du nom de département */
  deptCode?: string;
}

const CODE_RE = /^(\d{5}|2[AB]\d{3})$/i;

// Régions (actuelles et d'avant 2016) et pays, qui ne sont jamais la commune
const NON_COMMUNE_PARTS = new Set([
  'france', 'aquitaine', 'nouvelle aquitaine', 'limousin', 'poitou charentes', 'pays de la loire',
  'ile de france', 'rhone alpes', 'auvergne rhone alpes', 'auvergne', 'lorraine', 'alsace', 'grand est',
  'champagne ardenne', 'bretagne', 'normandie', 'basse normandie', 'haute normandie', 'centre',
  'centre val de loire', 'bourgogne', 'franche comte', 'bourgogne franche comte', 'midi pyrenees',
  'languedoc roussillon', 'occitanie', 'provence alpes cote d azur', 'paca', 'corse', 'picardie',
  'nord pas de calais', 'hauts de france',
]);

/** La partie est-elle un nom de département, de région ou le pays (et non une commune) ? */
function isAdministrativePart(part: string): boolean {
  const n = normalizeName(part);
  if (NON_COMMUNE_PARTS.has(n)) return true;
  const dept = extractDept(part);
  return Boolean(dept && !/\d/.test(part) && normalizeName(deptName(dept) || '') === n);
}

/**
 * Décompose un lieu généalogique. Formats rencontrés :
 * « Commune, 24489, Dordogne, Aquitaine, France », « Lieu-dit - Commune, 24489, … »,
 * « Lieu-dit, Commune, 24133, … », « 35400 Saint-Malo », « Commune » seule.
 */
export function parsePlace(raw: string): ParsedPlace {
  const parts = (raw || '').split(',').map(p => p.trim()).filter(Boolean);
  const codeIdx = parts.findIndex(p => CODE_RE.test(p));
  let hamlet: string | undefined;
  // Avec un code, la commune le précède ; sans code, c'est le dernier nom qui n'est ni département,
  // ni région, ni pays (« Lieu-dit, Commune, France »)
  const named = codeIdx >= 0 ? parts.slice(0, codeIdx) : parts.filter(p => !isAdministrativePart(p));
  let communePart = named[named.length - 1] || parts[0] || '';
  if (named.length > 1) hamlet = named.slice(0, -1).join(', ');

  // Code postal en tête (« 35400 Saint-Malo »)
  let code = codeIdx >= 0 ? parts[codeIdx].toUpperCase() : undefined;
  const leading = communePart.match(/^(\d{5})\s+(.+)$/);
  if (leading) {
    code = code || leading[1];
    communePart = leading[2];
  }

  // « Lieu-dit - Commune »
  const dash = communePart.split(/\s+-\s+/);
  if (dash.length > 1) {
    hamlet = [hamlet, dash.slice(0, -1).join(' - ')].filter(Boolean).join(', ');
    communePart = dash[dash.length - 1];
  }

  return {
    commune: communePart.replace(/\s+-\s*|\s*-\s+/g, '-').replace(/\s+/g, ' ').trim(),
    hamlet: hamlet || undefined,
    code,
    deptCode: extractDept(raw) || undefined,
  };
}

/**
 * Extrait le nom de la commune principale depuis une chaîne de lieu généalogique.
 * Ex: "Bas Ribeyreix - Saint-Priest-les-Fougères, 24489, Dordogne" -> "Saint-Priest-les-Fougères"
 */
export function extractCommuneName(rawPlace: string): string {
  return parsePlace(rawPlace).commune;
}

/**
 * Le nom renvoyé par un géocodeur correspond-il au lieu demandé ? Égalité (accents, tirets et casse ignorés),
 * ou suite de mots du lieu (« la tuillerie de babaud saint priest ligoure » → Saint-Priest-Ligoure),
 * mais jamais un morceau d'un nom composé (« Saint-Priest-les-Fougères » n'est pas « Fougères »).
 */
export function placeNameMatches(query: string, resultName: string): boolean {
  const target = normalizeName(resultName);
  if (!target || !normalizeName(query)) return false;
  // Mots du lieu, en gardant les noms composés (reliés par des tirets) d'un seul tenant
  const words = (query || '').trim().split(/\s+/).filter(w => w && w !== '-');
  for (let start = 0; start < words.length; start++) {
    for (let end = start + 1; end <= words.length; end++) {
      if (normalizeName(words.slice(start, end).join(' ')) === target) return true;
    }
  }
  return false;
}

/**
 * Tente de résoudre les coordonnées GPS d'un lieu de façon synchrone (cache, puis dictionnaire).
 * Le dictionnaire n'est utilisé que sur un nom de commune exact, et jamais s'il contredit le département.
 */
export function resolveFrenchPlaceSync(placeString: string): GeoCoordinates | null {
  if (!placeString) return null;

  const cache = getPersistentCache();
  const cacheKey = normalizePlaceKey(placeString);
  if (cache[cacheKey]) return { ...cache[cacheKey], source: 'cache' };

  const { commune, deptCode } = parsePlace(placeString);
  const known = KNOWN_FRENCH_PLACES[normalizePlaceKey(commune)];
  if (known) {
    const expectedDept = deptCode ? deptName(deptCode) : null;
    if (!expectedDept || normalizeName(expectedDept) === normalizeName(known.department || '')) {
      // Graphie de l'arbre, avec majuscules si elle est tout en minuscules (« lyon » → « Lyon »)
      const name = commune === commune.toLowerCase()
        ? commune.replace(/(^|[\s-])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase())
        : commune;
      return { ...known, name: known.name || name, source: 'dictionary' };
    }
  }
  return null;
}

interface AdresseFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; city?: string; citycode?: string; postcode?: string; score?: number };
}

async function searchAdresse(params: Record<string, string>): Promise<AdresseFeature[]> {
  const query = new URLSearchParams({ type: 'municipality', limit: '5', ...params });
  const res = await fetch(`https://api-adresse.data.gouv.fr/search/?${query.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.features) ? data.features : [];
}

function fromFeature(feature: AdresseFeature): GeoCoordinates {
  const [lng, lat] = feature.geometry.coordinates;
  const citycode = feature.properties.citycode || '';
  const dept = citycode.startsWith('97') ? citycode.slice(0, 3) : citycode.slice(0, 2);
  return {
    lat,
    lng,
    source: 'osm_api',
    name: feature.properties.name,
    department: deptName(dept) || undefined,
    region: deptRegion(dept) || undefined,
  };
}

interface GeoCommune {
  nom: string;
  code: string;
  codeDepartement?: string;
  centre?: { coordinates: [number, number] };
}

/** API Découpage administratif (geo.api.gouv.fr) : communes par code INSEE ou par code postal */
async function fetchGeoCommunes(path: string): Promise<GeoCommune[]> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`https://geo.api.gouv.fr/${path}${sep}fields=nom,code,codeDepartement,centre`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const list: GeoCommune[] = Array.isArray(data) ? data : [data];
  return list.filter(c => c && c.centre?.coordinates);
}

function fromGeoCommune(c: GeoCommune): GeoCoordinates {
  const [lng, lat] = c.centre!.coordinates;
  const dept = c.codeDepartement || c.code.slice(0, c.code.startsWith('97') ? 3 : 2);
  return { lat, lng, source: 'osm_api', name: c.nom, department: deptName(dept) || undefined, region: deptRegion(dept) || undefined };
}

/**
 * Résout les coordonnées géographiques d'un lieu de façon asynchrone :
 *  1. par le code présent dans le lieu (code INSEE ou code postal, geo.api.gouv.fr) ;
 *  2. par le nom de commune (Base Adresse Nationale), dans le département s'il est connu ;
 *  3. à défaut, OpenStreetMap Nominatim (lieux hors de France compris, ex. « Bâle »).
 */
export async function resolveFrenchPlaceAsync(placeString: string): Promise<GeoCoordinates | null> {
  const syncMatch = resolveFrenchPlaceSync(placeString);
  if (syncMatch) return syncMatch;

  const { commune, code, deptCode } = parsePlace(placeString);
  if (!commune) return null;
  const cacheKey = normalizePlaceKey(placeString);
  const remember = (coords: GeoCoordinates) => {
    savePersistentCache(cacheKey, coords);
    return coords;
  };

  try {
    if (code) {
      // Le code désigne la commune même si le nom est mal orthographié ou si c'est un lieu-dit.
      // Un même nombre peut être le code INSEE d'une commune et le code postal d'une autre :
      // on préfère la commune dont le nom correspond, puis la commune du code INSEE.
      const [byInsee, byPostcode] = await Promise.all([
        fetchGeoCommunes(`communes/${encodeURIComponent(code)}`),
        fetchGeoCommunes(`communes?codePostal=${encodeURIComponent(code)}`),
      ]);
      const named = [...byInsee, ...byPostcode].find(c => placeNameMatches(commune, c.nom));
      const chosen = named || byInsee[0] || (byPostcode.length === 1 ? byPostcode[0] : undefined);
      if (chosen) return remember(fromGeoCommune(chosen));
    }

    const byName = await searchAdresse({ q: commune });
    const candidates = byName.filter(f =>
      placeNameMatches(commune, f.properties.name || '') &&
      (!deptCode || (f.properties.citycode || '').startsWith(deptCode))
    );
    // Sans département connu, on évite les homonymes d'outre-mer
    const best = candidates.find(f => deptCode || !(f.properties.citycode || '').startsWith('97')) || candidates[0];
    if (best) return remember(fromFeature(best));
  } catch (e) {
    // Hors ligne ou API indisponible : on tente Nominatim
  }

  try {
    const dept = deptCode ? deptName(deptCode) : null;
    const params = new URLSearchParams({ format: 'json', limit: '1', q: dept ? `${commune}, ${dept}` : commune });
    if (dept) params.set('countrycodes', 'fr');
    const resOsm = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (resOsm.ok) {
      const dataOsm = await resOsm.json();
      const first = Array.isArray(dataOsm) ? dataOsm[0] : null;
      const lat = first ? parseFloat(first.lat) : NaN;
      const lng = first ? parseFloat(first.lon) : NaN;
      if (!isNaN(lat) && !isNaN(lng)) {
        const osmName = typeof first.display_name === 'string' ? first.display_name.split(',')[0].trim() : undefined;
        return remember({ lat, lng, source: 'osm_api', name: osmName, department: dept || undefined });
      }
    }
  } catch (e) {}

  return null;
}
