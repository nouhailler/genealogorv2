import { describe, it, expect } from 'vitest';
import { extractDept, deptName, region, cityFromPlace, allDepts, normalize } from '../place-gazetteer';

describe('Place Gazetteer & INSEE Department Detection', () => {
  it('extracts département from 5-digit postal codes', () => {
    expect(extractDept('87000 Limoges')).toBe('87');
    expect(extractDept('Nantes (44000)')).toBe('44');
    expect(extractDept('Pointe-à-Pitre 97110')).toBe('971');
    expect(extractDept('Fort-de-France 97200')).toBe('972');
  });

  it('extracts département from literal French department names', () => {
    expect(extractDept('Limoges, Haute-Vienne, France')).toBe('87');
    expect(extractDept('Saint-Malo, Ille-et-Vilaine')).toBe('35');
    expect(extractDept('Brest, Finistère')).toBe('29');
    expect(extractDept('Angers, Maine-et-Loire')).toBe('49');
    expect(extractDept('Blois, Loir-et-Cher')).toBe('41');
  });

  it('handles historical and pre-reform département names', () => {
    expect(extractDept('Nantes, Loire-Inférieure')).toBe('44');
    expect(extractDept('Pau, Basses-Pyrénées')).toBe('64');
    expect(extractDept('Saint-Brieuc, Côtes-du-Nord')).toBe('22');
    expect(extractDept('Rouen, Seine-Inférieure')).toBe('76');
  });

  it('extracts département from trailing numbers with parentheses', () => {
    expect(extractDept('Cholet (49)')).toBe('49');
    expect(extractDept('Bordeaux 33')).toBe('33');
    expect(extractDept('Ajaccio (2A)')).toBe('2A');
    expect(extractDept('Bastia (2B)')).toBe('2B');
  });

  it('returns null for foreign or unidentifiable places', () => {
    expect(extractDept('London, UK')).toBeNull();
    expect(extractDept('Madrid, Espagne')).toBeNull();
    expect(extractDept('')).toBeNull();
    expect(extractDept(undefined)).toBeNull();
  });

  it('provides official department name and region', () => {
    expect(deptName('87')).toBe('Haute-Vienne');
    expect(region('87')).toBe('Nouvelle-Aquitaine');

    expect(deptName('44')).toBe('Loire-Atlantique');
    expect(region('44')).toBe('Pays de la Loire');

    expect(deptName('75')).toBe('Paris');
    expect(region('75')).toBe('Île-de-France');
  });

  it('extracts city name cleanly from full place strings', () => {
    expect(cityFromPlace('Limoges, Haute-Vienne, France')).toBe('Limoges');
    expect(cityFromPlace('Nantes (44000)')).toBe('Nantes');
    expect(cityFromPlace('Bordeaux (33)')).toBe('Bordeaux');
    expect(cityFromPlace(null)).toBe('');
  });

  it('returns all 101 French departments', () => {
    const list = allDepts();
    expect(list.length).toBeGreaterThanOrEqual(100);
    const codes = list.map((d) => d.code);
    expect(codes).toContain('01');
    expect(codes).toContain('75');
    expect(codes).toContain('87');
    expect(codes).toContain('2A');
    expect(codes).toContain('2B');
    expect(codes).toContain('974');
  });
});
