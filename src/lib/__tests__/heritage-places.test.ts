import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

import {
  buildOverpassQuery,
  parseOverpassResponse,
  cellsFor,
  boundsOfCells,
  loadHeritagePlaces,
  findNearby,
  resetHeritageCache,
  distanceMeters,
  denominationLabel,
  CACHE_TTL_MS,
  MAX_CELLS_PER_REQUEST,
  OVERPASS_URL,
} from '../heritage-places';

// Saint-Pierre-de-Frugie (Dordogne) et alentours
const RESPONSE = {
  elements: [
    { type: 'node', id: 1, lat: 45.5385, lon: 0.9905, tags: { amenity: 'place_of_worship', religion: 'christian', denomination: 'catholic', name: 'Église Saint-Pierre et Saint-Paul' } },
    { type: 'way', id: 2, center: { lat: 45.5372, lon: 0.9921 }, tags: { landuse: 'cemetery', name: 'Vieux Cimetière de Saint-Pierre-de-Frugie' } },
    { type: 'way', id: 3, center: { lat: 45.5450, lon: 0.9700 }, tags: { amenity: 'grave_yard' } },
    { type: 'way', id: 4, center: { lat: 45.5300, lon: 1.0200 }, tags: { amenity: 'place_of_worship', religion: 'christian', building: 'chapel', name: 'Chapelle de Ribeyreix' } },
    { type: 'node', id: 5, lat: 45.531, lon: 1.01, tags: { amenity: 'place_of_worship', religion: 'christian', name: 'Chapelle Notre-Dame' } },
    { type: 'node', id: 6, lat: 45.5, lon: 1.0, tags: { amenity: 'restaurant' } }, // ignoré
    { type: 'way', id: 7, tags: { landuse: 'cemetery' } },                           // sans position : ignoré
    { type: 'node', id: 1, lat: 45.5385, lon: 0.9905, tags: { amenity: 'place_of_worship', religion: 'christian' } }, // doublon
  ],
};

function fakeFetcher(response: unknown = RESPONSE, status = 200) {
  return vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(response), { status }));
}

const AREA = { south: 45.52, west: 0.95, north: 45.56, east: 1.04 };

beforeEach(() => {
  store.clear();
  resetHeritageCache();
});

describe('requête et lecture Overpass', () => {
  it('demande églises chrétiennes et cimetières, avec le centre des surfaces', () => {
    const q = buildOverpassQuery(AREA);
    expect(q).toContain('nwr["amenity"="place_of_worship"]["religion"="christian"](45.52,0.95,45.56,1.04);');
    expect(q).toContain('nwr["landuse"="cemetery"]');
    expect(q).toContain('nwr["amenity"="grave_yard"]');
    expect(q).toContain('out center tags;');
  });

  it('classe églises, chapelles et cimetières, et ignore le reste', () => {
    const places = parseOverpassResponse(RESPONSE as any);
    expect(places.map(p => [p.id, p.kind, p.name ?? null])).toEqual([
      ['node/1', 'church', 'Église Saint-Pierre et Saint-Paul'],
      ['way/2', 'cemetery', 'Vieux Cimetière de Saint-Pierre-de-Frugie'],
      ['way/3', 'cemetery', null],
      ['way/4', 'chapel', 'Chapelle de Ribeyreix'],
      ['node/5', 'chapel', 'Chapelle Notre-Dame'],
    ]);
    expect(places[0]).toMatchObject({ lat: 45.5385, lng: 0.9905, denomination: 'catholic', osmUrl: 'https://www.openstreetmap.org/node/1' });
    expect(places[1]).toMatchObject({ lat: 45.5372, lng: 0.9921 });
  });

  it('traduit les confessions', () => {
    expect(denominationLabel('catholic')).toBe('catholique');
    expect(denominationLabel('protestant')).toBe('protestante');
    expect(denominationLabel('old_catholic')).toBe('old catholic');
    expect(denominationLabel(undefined)).toBeUndefined();
  });
});

describe('cellules de cache', () => {
  it('découpe une zone en cellules de 0,1° et retrouve leur rectangle', () => {
    const cells = cellsFor(AREA);
    expect(cells).toEqual([{ row: 455, col: 9 }, { row: 455, col: 10 }]);
    expect(boundsOfCells(cells)).toEqual({ south: 45.5, west: 0.9, north: 45.6, east: 1.1 });
  });
});

describe('loadHeritagePlaces', () => {
  it('une seule requête pour la zone, puis le cache', async () => {
    const fetcher = fakeFetcher();
    const first = await loadHeritagePlaces(AREA, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(OVERPASS_URL);
    expect(decodeURIComponent(String(fetcher.mock.calls[0][1].body))).toContain('(45.5,0.9,45.6,1.1)');
    expect(first).toHaveLength(5);

    const again = await loadHeritagePlaces({ south: 45.53, west: 0.96, north: 45.55, east: 1.0 }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(again.map(p => p.id).sort()).toEqual(['node/1', 'way/2', 'way/3']);
  });

  it('garde le cache après un rechargement de la page, et l\'oublie après 30 jours', async () => {
    await loadHeritagePlaces(AREA, fakeFetcher());
    resetHeritageCache(); // simule un rechargement : mémoire vide, localStorage conservé
    const fetcher = fakeFetcher();
    expect(await loadHeritagePlaces(AREA, fetcher)).toHaveLength(5);
    expect(fetcher).not.toHaveBeenCalled();

    resetHeritageCache();
    const realNow = Date.now;
    Date.now = () => realNow() + CACHE_TTL_MS + 1000;
    try {
      const later = fakeFetcher();
      await loadHeritagePlaces(AREA, later);
      expect(later).toHaveBeenCalledTimes(1);
    } finally {
      Date.now = realNow;
    }
  });

  it('messages clairs quand le service est saturé ou indisponible, sans mettre l\'échec en cache', async () => {
    await expect(loadHeritagePlaces(AREA, fakeFetcher({}, 429))).rejects.toThrow('saturé');
    await expect(loadHeritagePlaces(AREA, fakeFetcher({}, 500))).rejects.toThrow('indisponible (500)');
    await expect(loadHeritagePlaces(AREA, vi.fn(async () => { throw new TypeError('Failed to fetch'); }))).rejects.toThrow('injoignable');
    const ok = fakeFetcher();
    expect(await loadHeritagePlaces(AREA, ok)).toHaveLength(5);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('refuse une zone trop vaste', async () => {
    const side = Math.ceil(Math.sqrt(MAX_CELLS_PER_REQUEST)) + 1;
    await expect(loadHeritagePlaces({ south: 45, west: 0, north: 45 + side * 0.1, east: side * 0.1 }, fakeFetcher()))
      .rejects.toThrow('zoomez');
  });
});

describe('findNearby', () => {
  it('trie par distance, filtre par rayon et par type', async () => {
    const fetcher = fakeFetcher();
    const near = await findNearby(45.538, 0.99, { radiusMeters: 1000, fetcher });
    expect(near.map(p => p.id)).toEqual(['node/1', 'way/2']);
    expect(near[0].distance).toBeLessThan(near[1].distance);

    const cemeteries = await findNearby(45.538, 0.99, { radiusMeters: 3000, kinds: ['cemetery'], fetcher });
    expect(cemeteries.every(p => p.kind === 'cemetery')).toBe(true);
    expect(cemeteries.map(p => p.id)).toEqual(['way/2', 'way/3']);
  });

  it('calcule une distance réaliste', () => {
    // Deux points de Saint-Pierre-de-Frugie distants d’environ 1,1 km
    const d = distanceMeters(45.5385, 0.9905, 45.5420, 0.9770);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1200);
  });
});
