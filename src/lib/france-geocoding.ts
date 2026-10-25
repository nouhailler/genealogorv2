/**
 * Dictionnaire de géocodage et résolveur cartographique OpenStreetMap
 * optimisé pour la généalogie française (paroisses, communes, départements).
 */

export interface GeoCoordinates {
  lat: number;
  lng: number;
  source?: 'dictionary' | 'cache' | 'osm_api';
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

// Cache en mémoire et local
const GEOCACHE_STORAGE_KEY = 'genealogor_geocache_v2';

function getPersistentCache(): Record<string, GeoCoordinates> {
  if (typeof localStorage === 'undefined') return {};
  try {
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
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Extrait le nom de la commune principale depuis une chaîne de lieu généalogique.
 * Ex: "Cancale, Ille-et-Vilaine, Bretagne, France" -> "Cancale"
 */
export function extractCommuneName(rawPlace: string): string {
  if (!rawPlace) return '';
  const firstPart = rawPlace.split(',')[0].trim();
  // Retirer les codes postaux initiaux (ex: "35400 Saint-Malo" -> "Saint-Malo")
  return firstPart.replace(/^[0-9]{4,5}\s+/, '').trim();
}

/**
 * Tente de résoudre les coordonnées GPS d'un lieu français de façon synchrone.
 */
export function resolveFrenchPlaceSync(placeString: string): GeoCoordinates | null {
  if (!placeString) return null;

  const commune = extractCommuneName(placeString);
  const normalizedCommune = normalizePlaceKey(commune);
  const normalizedFull = normalizePlaceKey(placeString);

  // 1. Dictionnaire local direct
  if (KNOWN_FRENCH_PLACES[normalizedCommune]) {
    return { ...KNOWN_FRENCH_PLACES[normalizedCommune], source: 'dictionary' };
  }
  if (KNOWN_FRENCH_PLACES[normalizedFull]) {
    return { ...KNOWN_FRENCH_PLACES[normalizedFull], source: 'dictionary' };
  }

  // 2. Recherche partielle dans les clés du dictionnaire
  for (const [key, coords] of Object.entries(KNOWN_FRENCH_PLACES)) {
    if (normalizedCommune.includes(key) || key.includes(normalizedCommune)) {
      return { ...coords, source: 'dictionary' };
    }
  }

  // 3. Cache persistant local
  const cache = getPersistentCache();
  if (cache[normalizedCommune]) {
    return { ...cache[normalizedCommune], source: 'cache' };
  }
  if (cache[normalizedFull]) {
    return { ...cache[normalizedFull], source: 'cache' };
  }

  return null;
}

/**
 * Résout les coordonnées géographiques d'un lieu de façon asynchrone avec fallback
 * sur l'API publique de géocodage officielle française (data.gouv.fr) ou OpenStreetMap Nominatim.
 */
export async function resolveFrenchPlaceAsync(placeString: string): Promise<GeoCoordinates | null> {
  const syncMatch = resolveFrenchPlaceSync(placeString);
  if (syncMatch) return syncMatch;

  const commune = extractCommuneName(placeString);
  const normalizedCommune = normalizePlaceKey(commune);

  try {
    // 1. Tentative avec l'API publique et libre de l'État Français (base adresses nationales)
    const gouvUrl = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(commune + ' France')}&limit=1`;
    const res = await fetch(gouvUrl, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const feature = data.features?.[0];
      if (feature && feature.geometry && feature.geometry.coordinates) {
        const [lng, lat] = feature.geometry.coordinates;
        const coords: GeoCoordinates = {
          lat,
          lng,
          source: 'osm_api',
          department: feature.properties?.context?.split(',')?.[1]?.trim(),
          region: feature.properties?.context?.split(',')?.[2]?.trim(),
        };
        savePersistentCache(normalizedCommune, coords);
        return coords;
      }
    }
  } catch (e) {
    // Fallback silencieux en cas de mode hors ligne ou d'échec réseau
  }

  // 2. Fallback Nominatim OpenStreetMap
  try {
    const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=fr&q=${encodeURIComponent(commune)}&limit=1`;
    const resOsm = await fetch(osmUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Genealogor-App/2.0 (genealogor@genealogor.app)'
      }
    });
    if (resOsm.ok) {
      const dataOsm = await resOsm.json();
      if (Array.isArray(dataOsm) && dataOsm.length > 0) {
        const first = dataOsm[0];
        const lat = parseFloat(first.lat);
        const lng = parseFloat(first.lon);
        if (!isNaN(lat) && !isNaN(lng)) {
          const coords: GeoCoordinates = { lat, lng, source: 'osm_api' };
          savePersistentCache(normalizedCommune, coords);
          return coords;
        }
      }
    }
  } catch (e) {}

  return null;
}
