import { describe, it, expect } from 'vitest';
import { compute, isImplexedFor } from '../implex';
import type { Individual, Family } from '../../types/genealogy';

describe('Implex & Endogamy Calculation', () => {
  it('computes 0% endogamy on a strictly linear tree without cousin marriages', () => {
    const root: Individual = { id: 'I1', name: 'Child', sex: 'M', familiesAsSpouse: [], familiesAsChild: ['F1'] };
    const father: Individual = { id: 'I2', name: 'Father', sex: 'M', familiesAsSpouse: ['F1'], familiesAsChild: ['F2'] };
    const mother: Individual = { id: 'I3', name: 'Mother', sex: 'F', familiesAsSpouse: ['F1'], familiesAsChild: ['F3'] };
    const gp1: Individual = { id: 'I4', name: 'GF1', sex: 'M', familiesAsSpouse: ['F2'], familiesAsChild: [] };
    const gm1: Individual = { id: 'I5', name: 'GM1', sex: 'F', familiesAsSpouse: ['F2'], familiesAsChild: [] };
    const gp2: Individual = { id: 'I6', name: 'GF2', sex: 'M', familiesAsSpouse: ['F3'], familiesAsChild: [] };
    const gm2: Individual = { id: 'I7', name: 'GM2', sex: 'F', familiesAsSpouse: ['F3'], familiesAsChild: [] };

    const individuals: Record<string, Individual> = {
      I1: root, I2: father, I3: mother, I4: gp1, I5: gm1, I6: gp2, I7: gm2,
    };

    const families: Record<string, Family> = {
      F1: { id: 'F1', husbandId: 'I2', wifeId: 'I3', childrenIds: ['I1'] },
      F2: { id: 'F2', husbandId: 'I4', wifeId: 'I5', childrenIds: ['I2'] },
      F3: { id: 'F3', husbandId: 'I6', wifeId: 'I7', childrenIds: ['I3'] },
    };

    const res = compute(root, individuals, families, 5);
    expect(res.globalEndogamy).toBe(0);
    expect(res.implexEntries).toHaveLength(0);
    expect(res.distinctAncestors).toBe(7);
    expect(isImplexedFor('I4', res)).toBe(false);
  });

  it('detects implex when an ancestor appears on both paternal and maternal branches', () => {
    // Shared common grandfather I4
    const root: Individual = { id: 'I1', name: 'Child', sex: 'M', familiesAsSpouse: [], familiesAsChild: ['F1'] };
    const father: Individual = { id: 'I2', name: 'Father', sex: 'M', familiesAsSpouse: ['F1'], familiesAsChild: ['F2'] };
    const mother: Individual = { id: 'I3', name: 'Mother', sex: 'F', familiesAsSpouse: ['F1'], familiesAsChild: ['F3'] };
    const commonGF: Individual = { id: 'I4', name: 'Common Grandfather', sex: 'M', familiesAsSpouse: ['F2', 'F3'], familiesAsChild: [] };
    const gm1: Individual = { id: 'I5', name: 'GM1', sex: 'F', familiesAsSpouse: ['F2'], familiesAsChild: [] };
    const gm2: Individual = { id: 'I6', name: 'GM2', sex: 'F', familiesAsSpouse: ['F3'], familiesAsChild: [] };

    const individuals: Record<string, Individual> = {
      I1: root, I2: father, I3: mother, I4: commonGF, I5: gm1, I6: gm2,
    };

    const families: Record<string, Family> = {
      F1: { id: 'F1', husbandId: 'I2', wifeId: 'I3', childrenIds: ['I1'] },
      F2: { id: 'F2', husbandId: 'I4', wifeId: 'I5', childrenIds: ['I2'] },
      F3: { id: 'F3', husbandId: 'I4', wifeId: 'I6', childrenIds: ['I3'] },
    };

    const res = compute(root, individuals, families, 5);
    expect(res.implexEntries.length).toBeGreaterThan(0);
    expect(res.implexEntries[0].person.id).toBe('I4');
    expect(res.implexEntries[0].sosaNumbers).toContain(4); // Father's father
    expect(res.implexEntries[0].sosaNumbers).toContain(6); // Mother's father
    expect(isImplexedFor('I4', res)).toBe(true);
    expect(res.globalEndogamy).toBeGreaterThan(0);
  });
});
