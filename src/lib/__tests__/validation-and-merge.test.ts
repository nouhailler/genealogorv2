import { describe, it, expect } from 'vitest';
import { validateChronology, detectRelationshipCycles } from '../validation';
import { findDuplicateCandidates, mergeIndividuals } from '../duplicate-detector';
import { GenealogyData } from '../../types/genealogy';

describe('Validation chronologique et Cohérence (P1 - Exigence 6)', () => {
  it('détecte une anomalie de décès antérieur à la naissance', () => {
    const data: GenealogyData = {
      individuals: {
        '@I1@': {
          id: '@I1@',
          name: 'Jean Martin',
          sex: 'M',
          birth: { date: '1750', parsedDate: { raw: '1750', year: 1750 } },
          death: { date: '1740', parsedDate: { raw: '1740', year: 1740 } },
          familiesAsChild: [],
          familiesAsSpouse: [],
        },
      },
      families: {},
    };

    const anomalies = validateChronology(data);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].code).toBe('DEATH_BEFORE_BIRTH');
  });

  it('détecte un parent trop jeune lors de la naissance d\'un enfant', () => {
    const data: GenealogyData = {
      individuals: {
        '@FATH@': {
          id: '@FATH@',
          name: 'Jeune Père',
          sex: 'M',
          birth: { parsedDate: { raw: '1750', year: 1750 } },
          familiesAsChild: [],
          familiesAsSpouse: ['@FAM1@'],
        },
        '@CHIL@': {
          id: '@CHIL@',
          name: 'Enfant Précoce',
          sex: 'M',
          birth: { parsedDate: { raw: '1758', year: 1758 } }, // Âge = 8 ans !
          familiesAsChild: ['@FAM1@'],
          familiesAsSpouse: [],
        },
      },
      families: {
        '@FAM1@': {
          id: '@FAM1@',
          husbandId: '@FATH@',
          childrenIds: ['@CHIL@'],
          notes: [],
        },
      },
    };

    const anomalies = validateChronology(data);
    expect(anomalies.some(a => a.code === 'PARENT_TOO_YOUNG')).toBe(true);
  });

  it('détecte un cycle interdit dans les relations parent-enfant', () => {
    // A est parent de B, qui est parent de A
    const data: GenealogyData = {
      individuals: {
        '@A@': { id: '@A@', name: 'Personne A', sex: 'M', familiesAsChild: ['@F2@'], familiesAsSpouse: ['@F1@'] },
        '@B@': { id: '@B@', name: 'Personne B', sex: 'M', familiesAsChild: ['@F1@'], familiesAsSpouse: ['@F2@'] },
      },
      families: {
        '@F1@': { id: '@F1@', husbandId: '@A@', childrenIds: ['@B@'] },
        '@F2@': { id: '@F2@', husbandId: '@B@', childrenIds: ['@A@'] },
      },
    };

    const cycles = detectRelationshipCycles(data);
    expect(cycles.length).toBeGreaterThan(0);
  });
});

describe('Détection et fusion de doublons (P1 - Exigence 7)', () => {
  it('détecte des doublons potentiels avec score élevé', () => {
    const data: GenealogyData = {
      individuals: {
        '@I1@': {
          id: '@I1@',
          name: 'Pierre Martin',
          givenName: 'Pierre',
          surname: 'Martin',
          sex: 'M',
          birth: { date: '1715', place: 'Dinan', parsedDate: { raw: '1715', year: 1715 } },
          death: { date: '1782', place: 'Saint-Malo', parsedDate: { raw: '1782', year: 1782 } },
          familiesAsChild: [],
          familiesAsSpouse: [],
        },
        '@I2@': {
          id: '@I2@',
          name: 'Pierre Martin',
          givenName: 'Pierre',
          surname: 'Martin',
          sex: 'M',
          birth: { date: '1716', place: 'Dinan', parsedDate: { raw: '1716', year: 1716 } },
          death: { date: '1782', place: 'Saint-Malo', parsedDate: { raw: '1782', year: 1782 } },
          familiesAsChild: [],
          familiesAsSpouse: [],
        },
      },
      families: {},
    };

    const candidates = findDuplicateCandidates(data);
    expect(candidates.length).toBe(1);
    expect(candidates[0].score).toBeGreaterThan(80);
    expect(candidates[0].reasons).toContain('Même patronyme');
  });

  it('fusionne deux individus et met à jour toutes les relations sans orphelins', () => {
    const data: GenealogyData = {
      individuals: {
        '@KEEP@': {
          id: '@KEEP@',
          name: 'Pierre Martin',
          givenName: 'Pierre',
          surname: 'Martin',
          sex: 'M',
          occupations: ['Charpentier'],
          notes: ['Note A'],
          familiesAsChild: [],
          familiesAsSpouse: ['@FAM1@'],
        },
        '@DISCARD@': {
          id: '@DISCARD@',
          name: 'P. Martin',
          givenName: 'Pierre',
          surname: 'Martin',
          sex: 'M',
          occupations: ['Maître de navire'],
          notes: ['Note B'],
          familiesAsChild: [],
          familiesAsSpouse: ['@FAM2@'],
        },
        '@CHILD@': {
          id: '@CHILD@',
          name: 'François Martin',
          sex: 'M',
          familiesAsChild: ['@FAM2@'],
          familiesAsSpouse: [],
        },
      },
      families: {
        '@FAM1@': { id: '@FAM1@', husbandId: '@KEEP@', childrenIds: [] },
        '@FAM2@': { id: '@FAM2@', husbandId: '@DISCARD@', childrenIds: ['@CHILD@'] },
      },
    };

    const merged = mergeIndividuals(data, '@KEEP@', '@DISCARD@', {
      name: 'Pierre Martin',
      givenName: 'Pierre',
      surname: 'Martin',
      sex: 'M',
      occupations: ['Charpentier', 'Maître de navire'],
      notes: ['Note A', 'Note B'],
    });

    expect(merged.individuals['@DISCARD@']).toBeUndefined();
    expect(merged.individuals['@KEEP@'].occupations).toContain('Maître de navire');
    // Vérifier que la famille @FAM2@ pointe désormais vers @KEEP@
    expect(merged.families['@FAM2@'].husbandId).toBe('@KEEP@');
    expect(merged.families['@FAM2@'].childrenIds).toContain('@CHILD@');
  });
});
