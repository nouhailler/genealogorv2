import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = new Map<string, string>();
(global as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
};

import { parsePlace, placeNameMatches, resolveFrenchPlaceSync, resolveFrenchPlaceAsync } from '../france-geocoding';

/** Réponses simulées des API publiques, selon l'URL demandée */
function mockFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  (global as any).fetch = vi.fn(async (url: string) => {
    calls.push(url);
    const match = Object.keys(routes).find(prefix => url.includes(prefix));
    const body = match ? routes[match] : null;
    return { ok: body !== null, json: async () => body } as Response;
  });
  return calls;
}

const geoCommune = (nom: string, code: string, lng: number, lat: number) => ({
  nom, code, codeDepartement: code.slice(0, 2), centre: { coordinates: [lng, lat] },
});

describe('Géocodage des lieux généalogiques', () => {
  beforeEach(() => store.clear());

  it('décompose les formats de lieux rencontrés dans les GEDCOM', () => {
    expect(parsePlace('Saint-Priest-les-Fougères, 24489, Dordogne, Aquitaine, France'))
      .toMatchObject({ commune: 'Saint-Priest-les-Fougères', code: '24489', deptCode: '24' });
    expect(parsePlace('Bas Ribeyreix - Saint- Priest-les-Fougères, 24489, Dordogne'))
      .toMatchObject({ commune: 'Saint-Priest-les-Fougères', hamlet: 'Bas Ribeyreix', code: '24489' });
    expect(parsePlace('Curmont, La Coquille, 24133, Dordogne, Aquitaine, France'))
      .toMatchObject({ commune: 'La Coquille', hamlet: 'Curmont', code: '24133' });
    expect(parsePlace('Dienne, Saint-Priest-les-Fougères, France'))
      .toMatchObject({ commune: 'Saint-Priest-les-Fougères', hamlet: 'Dienne' });
    expect(parsePlace('Saint-Priest-les-Fougeres, Dordogne, Aquitaine, France'))
      .toMatchObject({ commune: 'Saint-Priest-les-Fougeres', deptCode: '24' });
    expect(parsePlace('35400 Saint-Malo')).toMatchObject({ commune: 'Saint-Malo', code: '35400' });
    expect(parsePlace('Nexon')).toMatchObject({ commune: 'Nexon' });
  });

  it('ne confond pas une commune avec une autre dont le nom est seulement proche', () => {
    expect(placeNameMatches('Saint Priest les fougeres', 'Saint-Priest-les-Fougères')).toBe(true);
    expect(placeNameMatches('la tuillerie de babaud saint priest ligoure', 'Saint-Priest-Ligoure')).toBe(true);
    expect(placeNameMatches('Bâle', 'Baleyssagues')).toBe(false);
    expect(placeNameMatches('Saint-Priest-les-Fougères', 'Fougères')).toBe(false);
  });

  it('n\'utilise plus le dictionnaire sur une correspondance partielle ou un autre département', () => {
    // Avant : « Saint-Priest-les-Fougères » tombait sur Fougères (Ille-et-Vilaine), « Rilhac-Lastours » sur Tours
    expect(resolveFrenchPlaceSync('Saint-Priest-les-Fougères, 24489, Dordogne, Aquitaine, France')).toBeNull();
    expect(resolveFrenchPlaceSync('Rilhac-Lastours, 87124, Haute Vienne, Limousin, France')).toBeNull();
    expect(resolveFrenchPlaceSync('Limoges, 87085, Haute Vienne, Limousin, France')).toMatchObject({ lat: 45.8336 });
  });

  it('localise par le code INSEE, même pour un lieu-dit', async () => {
    mockFetch({
      'communes/24486': geoCommune('Saint-Pierre-de-Frugie', '24486', 1.007, 45.5875),
      'codePostal=24486': [],
    });
    const coords = await resolveFrenchPlaceAsync('Verdenille, 24486, Dordogne, Aquitaine, France');
    expect(coords).toMatchObject({ lat: 45.5875, lng: 1.007, name: 'Saint-Pierre-de-Frugie', department: 'Dordogne' });
    // Mis en cache pour l'affichage immédiat suivant
    expect(resolveFrenchPlaceSync('Verdenille, 24486, Dordogne, Aquitaine, France')).toMatchObject({ lat: 45.5875 });
  });

  it('préfère la commune du code postal dont le nom correspond', async () => {
    mockFetch({
      'communes/87150': geoCommune('Autre commune', '87150', 1.5, 45.9),
      'codePostal=87150': [geoCommune('Champagnac-la-Rivière', '87034', 0.914, 45.703)],
    });
    const coords = await resolveFrenchPlaceAsync('Champagnac-la-Rivière,87150,Haute-Vienne,Limousin,FRANCE');
    expect(coords).toMatchObject({ lat: 45.703, name: 'Champagnac-la-Rivière' });
  });

  it('cherche par nom dans le bon département et écarte les homonymes', async () => {
    mockFetch({
      'api-adresse.data.gouv.fr': {
        features: [
          { geometry: { coordinates: [-1.2, 48.35] }, properties: { name: 'Saint-Priest-les-Fougères', citycode: '35999' } },
          { geometry: { coordinates: [1.026, 45.548] }, properties: { name: 'Saint-Priest-les-Fougères', citycode: '24489' } },
        ],
      },
    });
    const coords = await resolveFrenchPlaceAsync('Saint-Priest-les-Fougeres, Dordogne, Aquitaine, France');
    expect(coords).toMatchObject({ lat: 45.548, department: 'Dordogne' });
  });

  it('passe par OpenStreetMap pour un lieu étranger', async () => {
    mockFetch({
      'api-adresse.data.gouv.fr': { features: [{ geometry: { coordinates: [0.15, 44.68] }, properties: { name: 'Baleyssagues', citycode: '47020' } }] },
      'nominatim.openstreetmap.org': [{ lat: '47.558', lon: '7.587', display_name: 'Basel, Basel-Stadt, Schweiz' }],
    });
    const coords = await resolveFrenchPlaceAsync('Bâle');
    expect(coords).toMatchObject({ lat: 47.558, lng: 7.587, name: 'Basel' });
  });
});
