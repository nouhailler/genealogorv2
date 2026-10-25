import { describe, it, expect } from 'vitest';
import { deptArchives, linksFor } from '../archives-templates';
import type { Individual } from '../../types/genealogy';

describe('Archives Templates & 97 Departmental Archives', () => {
  it('resolves direct departmental archives URLs for valid codes', () => {
    const ad87 = deptArchives('87');
    expect(ad87).toBeDefined();
    expect(ad87?.label).toBe('AD Haute-Vienne');
    expect(ad87?.url).toContain('archives.haute-vienne.fr');

    const ad75 = deptArchives('75');
    expect(ad75).toBeDefined();
    expect(ad75?.label).toBe('AD Paris');
    expect(ad75?.url).toContain('archives.paris.fr');

    const ad44 = deptArchives('44');
    expect(ad44).toBeDefined();
    expect(ad44?.label).toBe('AD Loire-Atlantique');
  });

  it('returns null for nonexistent department code', () => {
    expect(deptArchives('999')).toBeNull();
    expect(deptArchives(null)).toBeNull();
  });

  it('generates research portal links for an individual and place', () => {
    const person: Individual = {
      id: 'I1',
      name: 'Jean Martin',
      givenName: 'Jean',
      surname: 'Martin',
      sex: 'M',
      familiesAsSpouse: [],
      familiesAsChild: [],
    };

    const links = linksFor({ person, place: '87000 Limoges' });
    expect(links.length).toBeGreaterThanOrEqual(5);

    const sources = links.map((l) => l.source);
    expect(sources).toContain('Geneanet');
    expect(sources).toContain('FamilySearch');
    expect(sources).toContain('Filae');
    expect(sources).toContain('Gallica BnF');
    expect(sources).toContain('Wikidata');

    // Also includes the departmental archive link for 87
    const adLink = links.find((l) => l.kind === 'archives');
    expect(adLink).toBeDefined();
    expect(adLink?.dept).toBe('87');
    expect(adLink?.url).toContain('haute-vienne');
  });
});
