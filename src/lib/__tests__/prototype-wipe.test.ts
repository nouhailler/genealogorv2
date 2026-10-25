import { describe, it, expect, beforeEach } from 'vitest';
import { getSampleGenealogy, createEmptyGenealogy, isSampleGenealogy } from '../sample-data';
import { getStoredArchives, clearStoredArchives, getDefaultArchives } from '../archive-store';
import { validateChronology } from '../validation';
import { computeSosaNumbers } from '../sosa-aboville';
import { serializeGedcomWithReport } from '../gedcom-serializer';

// Mock localStorage in Node/Vitest environment
const mockStorage: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
  key: (i: number) => Object.keys(mockStorage)[i] || null,
  length: 0,
} as any;

describe('Initialisation propre & Arbre vierge', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('génère un arbre généalogique vierge sans individus ni familles', () => {
    const emptyTree = createEmptyGenealogy('Arbre Vierge');
    expect(emptyTree.individuals).toEqual({});
    expect(emptyTree.families).toEqual({});
    expect(emptyTree.rootPersonId).toBeUndefined();
    expect(emptyTree.sourceHeader).toBe('Arbre Vierge');
  });

  it('ne contient aucun document d’archives de test par défaut', () => {
    const defaultArchives = getDefaultArchives();
    expect(defaultArchives).toEqual([]);

    const stored = getStoredArchives();
    expect(stored).toEqual([]);
  });

  it('permet de vider les archives via clearStoredArchives', () => {
    clearStoredArchives();
    expect(getStoredArchives()).toEqual([]);
  });

  it('ne provoque pas d’erreur de validation ou de calcul Sosa sur un arbre vide', () => {
    const emptyTree = createEmptyGenealogy();
    expect(() => validateChronology(emptyTree)).not.toThrow();
    expect(validateChronology(emptyTree)).toEqual([]);

    expect(() => computeSosaNumbers(emptyTree)).not.toThrow();
    expect(computeSosaNumbers(emptyTree)).toEqual({});

    expect(() => serializeGedcomWithReport(emptyTree)).not.toThrow();
    const { report } = serializeGedcomWithReport(emptyTree);
    expect(report.totalIndividuals).toBe(0);
  });
});
