/**
 * Églises, chapelles et cimetières autour d'un lieu, d'après OpenStreetMap (API Overpass, sans clé).
 *
 * Utilisé par la carte (calque affiché à partir de l'échelle d'une commune) et conçu pour la suite :
 * `findNearby` permettra par exemple de proposer le cimetière ou l'église d'une inhumation, d'un baptême.
 *
 * Ménagement du service public : requêtes groupées par zone, mises en cache (cellules de 0,1°), une à la
 * fois, et seulement quand la carte est assez zoomée.
 */

export type HeritageKind = 'church' | 'chapel' | 'cemetery';

export interface HeritagePlace {
  /** Identifiant OSM, ex. « way/123456 » */
  id: string;
  kind: HeritageKind;
  /** Nom OSM, absent pour beaucoup de cimetières et de petites chapelles */
  name?: string;
  lat: number;
  lng: number;
  /** Confession (catholic, protestant, orthodox…) pour les lieux de culte */
  denomination?: string;
  /** Identifiant Wikidata éventuel (permettra d'enrichir la fiche du lieu) */
  wikidata?: string;
  osmUrl: string;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
/** Taille d'une cellule de cache, en degrés (~11 km × 8 km en France) */
export const CELL_SIZE = 0.1;
/** Au-delà, la zone demandée serait trop grande pour une requête raisonnable */
export const MAX_CELLS_PER_REQUEST = 36;

const KIND_LABELS: Record<HeritageKind, string> = { church: 'Église', chapel: 'Chapelle', cemetery: 'Cimetière' };
export const heritageKindLabel = (kind: HeritageKind) => KIND_LABELS[kind];

const DENOMINATION_LABELS: Record<string, string> = {
  catholic: 'catholique', roman_catholic: 'catholique', protestant: 'protestante', reformed: 'réformée',
  lutheran: 'luthérienne', orthodox: 'orthodoxe', russian_orthodox: 'orthodoxe russe', greek_orthodox: 'orthodoxe grecque',
  anglican: 'anglicane', evangelical: 'évangélique', baptist: 'baptiste', methodist: 'méthodiste',
};
export const denominationLabel = (d?: string) => (d ? DENOMINATION_LABELS[d] || d.replace(/_/g, ' ') : undefined);

/** Requête Overpass QL pour une zone */
export function buildOverpassQuery(b: Bounds): string {
  const bbox = `(${b.south},${b.west},${b.north},${b.east})`;
  return [
    '[out:json][timeout:25];',
    '(',
    `  nwr["amenity"="place_of_worship"]["religion"="christian"]${bbox};`,
    `  nwr["landuse"="cemetery"]${bbox};`,
    `  nwr["amenity"="grave_yard"]${bbox};`,
    ');',
    'out center tags;',
  ].join('\n');
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function classify(tags: Record<string, string>): HeritageKind | null {
  if (tags.landuse === 'cemetery' || tags.amenity === 'grave_yard') return 'cemetery';
  if (tags.amenity !== 'place_of_worship') return null;
  const building = tags.building || '';
  const name = (tags.name || '').toLowerCase();
  if (building === 'chapel' || tags.place_of_worship === 'chapel' || name.startsWith('chapelle')) return 'chapel';
  return 'church';
}

/** Transforme la réponse Overpass ; un cimetière attenant à une église (grave_yard) reste un cimetière à part */
export function parseOverpassResponse(json: { elements?: OverpassElement[] }): HeritagePlace[] {
  const out: HeritagePlace[] = [];
  const seen = new Set<string>();
  for (const el of json.elements || []) {
    const tags = el.tags || {};
    const kind = classify(tags);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!kind || lat === undefined || lng === undefined) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind,
      ...(tags.name ? { name: tags.name } : {}),
      lat,
      lng,
      ...(tags.denomination ? { denomination: tags.denomination } : {}),
      ...(tags.wikidata ? { wikidata: tags.wikidata } : {}),
      osmUrl: `https://www.openstreetmap.org/${id}`,
    });
  }
  return out;
}

// --- Cache par cellules ---

const cellKey = (row: number, col: number) => `${row}:${col}`;

export function cellsFor(b: Bounds): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [];
  const r0 = Math.floor(b.south / CELL_SIZE), r1 = Math.floor(b.north / CELL_SIZE);
  const c0 = Math.floor(b.west / CELL_SIZE), c1 = Math.floor(b.east / CELL_SIZE);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push({ row: r, col: c });
  return cells;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Plus petit rectangle de cellules couvrant celles demandées */
export function boundsOfCells(cells: Array<{ row: number; col: number }>): Bounds {
  const rows = cells.map(c => c.row), cols = cells.map(c => c.col);
  return {
    south: round6(Math.min(...rows) * CELL_SIZE),
    west: round6(Math.min(...cols) * CELL_SIZE),
    north: round6((Math.max(...rows) + 1) * CELL_SIZE),
    east: round6((Math.max(...cols) + 1) * CELL_SIZE),
  };
}

const loadedCells = new Set<string>();
const placesById = new Map<string, HeritagePlace>();
let queue: Promise<unknown> = Promise.resolve();

// --- Cache durable (localStorage) : une zone déjà vue s'affiche aussitôt, même après rechargement ---
// Le service public Overpass peut mettre plus de 30 s à répondre quand il est chargé.

const CACHE_KEY = 'genealogor_heritage_places_v1';
export const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
/** Au-delà, les cellules les plus anciennes sont oubliées (~quelques centaines de Ko au plus) */
export const CACHE_MAX_CELLS = 400;

interface StoredCache {
  cells: Record<string, number>; // cellule → date de chargement
  places: HeritagePlace[];
}
let cacheLoaded = false;
const cellLoadedAt = new Map<string, number>();

function cellOfPlace(p: HeritagePlace): string {
  return cellKey(Math.floor(p.lat / CELL_SIZE), Math.floor(p.lng / CELL_SIZE));
}

function readStoredCache(now: number): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_KEY) : null;
    if (!raw) return;
    const stored = JSON.parse(raw) as StoredCache;
    for (const [key, at] of Object.entries(stored.cells || {})) {
      if (now - at < CACHE_TTL_MS) { loadedCells.add(key); cellLoadedAt.set(key, at); }
    }
    for (const p of stored.places || []) if (loadedCells.has(cellOfPlace(p))) placesById.set(p.id, p);
  } catch {
    // cache illisible : ignoré, il sera reconstruit
  }
}

function writeStoredCache(): void {
  try {
    const keep = [...cellLoadedAt.entries()].sort((a, b) => b[1] - a[1]).slice(0, CACHE_MAX_CELLS);
    const keepSet = new Set(keep.map(([k]) => k));
    const stored: StoredCache = {
      cells: Object.fromEntries(keep),
      places: [...placesById.values()].filter(p => keepSet.has(cellOfPlace(p))),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(stored));
  } catch {
    // stockage plein ou indisponible : le cache reste en mémoire pour la session
  }
}

/** Délai maximal d'attente d'une réponse Overpass */
export const REQUEST_TIMEOUT_MS = 60_000;

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** Vide le cache (tests) */
export function resetHeritageCache(): void {
  loadedCells.clear();
  placesById.clear();
  cellLoadedAt.clear();
  cacheLoaded = false;
  queue = Promise.resolve();
}

/**
 * Lieux d'une zone : charge depuis Overpass les cellules pas encore connues (une requête pour toutes), puis
 * renvoie tous les lieux connus dans la zone. Les appels sont sérialisés.
 */
export function loadHeritagePlaces(b: Bounds, fetcher: Fetcher = fetch): Promise<HeritagePlace[]> {
  const task = async () => {
    const now = Date.now();
    readStoredCache(now);
    const missing = cellsFor(b).filter(c => !loadedCells.has(cellKey(c.row, c.col)));
    if (missing.length > MAX_CELLS_PER_REQUEST) throw new Error('Zone trop étendue : zoomez davantage.');
    if (missing.length > 0) {
      const area = boundsOfCells(missing);
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null;
      let res: Response;
      try {
        res = await fetcher(OVERPASS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          body: 'data=' + encodeURIComponent(buildOverpassQuery(area)),
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch (e) {
        throw new Error(
          (e as Error)?.name === 'AbortError'
            ? 'Le service OpenStreetMap n\'a pas répondu à temps : réessayez plus tard.'
            : 'Service OpenStreetMap injoignable (connexion Internet ?).'
        );
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (res.status === 429 || res.status === 504) throw new Error('Service OpenStreetMap saturé : réessayez dans un instant.');
      if (!res.ok) throw new Error(`Service OpenStreetMap indisponible (${res.status}).`);
      for (const place of parseOverpassResponse(await res.json())) placesById.set(place.id, place);
      // Toutes les cellules du rectangle interrogé sont désormais connues
      const rows = missing.map(c => c.row), cols = missing.map(c => c.col);
      for (let r = Math.min(...rows); r <= Math.max(...rows); r++) {
        for (let c = Math.min(...cols); c <= Math.max(...cols); c++) {
          loadedCells.add(cellKey(r, c));
          cellLoadedAt.set(cellKey(r, c), now);
        }
      }
      writeStoredCache();
    }
    return [...placesById.values()].filter(p => p.lat >= b.south && p.lat <= b.north && p.lng >= b.west && p.lng <= b.east);
  };
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

/** Distance en mètres (formule de haversine) */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Églises, chapelles ou cimetières les plus proches d'un point (ex. centre d'une commune), du plus proche au
 * plus lointain. Prévu pour proposer le lieu d'une inhumation ou d'un baptême.
 */
export async function findNearby(
  lat: number,
  lng: number,
  options: { radiusMeters?: number; kinds?: HeritageKind[]; fetcher?: Fetcher } = {}
): Promise<Array<HeritagePlace & { distance: number }>> {
  const radius = options.radiusMeters ?? 3000;
  const dLat = radius / 111320;
  const dLng = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const places = await loadHeritagePlaces(
    { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng },
    options.fetcher
  );
  return places
    .filter(p => !options.kinds || options.kinds.includes(p.kind))
    .map(p => ({ ...p, distance: Math.round(distanceMeters(lat, lng, p.lat, p.lng)) }))
    .filter(p => p.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
}
