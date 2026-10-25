import { describe, it, expect } from 'vitest';
import { computeAboville, findDeadBranches, computeCohortLifeExpectancy } from '../descendance';
import type { Individual, Family } from '../../types/genealogy';

describe('Descendance, Aboville & Dead Branches', () => {
  it('computes correct Aboville hierarchy numbers', () => {
    const root: Individual = { id: 'I1', name: 'Root', sex: 'M', familiesAsSpouse: ['F1'], familiesAsChild: [] };
    const child1: Individual = {
      id: 'I2',
      name: 'Child 1',
      sex: 'M',
      birth: { parsedDate: { year: 1950, raw: '1950' } },
      familiesAsSpouse: ['F2'],
      familiesAsChild: ['F1'],
    };
    const child2: Individual = {
      id: 'I3',
      name: 'Child 2',
      sex: 'F',
      birth: { parsedDate: { year: 1953, raw: '1953' } },
      familiesAsSpouse: [],
      familiesAsChild: ['F1'],
    };
    const grandChild1: Individual = {
      id: 'I4',
      name: 'Grandchild 1',
      sex: 'M',
      birth: { parsedDate: { year: 1980, raw: '1980' } },
      familiesAsSpouse: [],
      familiesAsChild: ['F2'],
    };

    const individuals: Record<string, Individual> = { I1: root, I2: child1, I3: child2, I4: grandChild1 };
    const families: Record<string, Family> = {
      F1: { id: 'F1', husbandId: 'I1', childrenIds: ['I2', 'I3'] },
      F2: { id: 'F2', husbandId: 'I2', childrenIds: ['I4'] },
    };

    const aboville = computeAboville(root, individuals, families, 5);
    expect(aboville.get('I1')).toBe('1');
    expect(aboville.get('I2')).toBe('1.1');
    expect(aboville.get('I3')).toBe('1.2');
    expect(aboville.get('I4')).toBe('1.1.1');
  });

  it('identifies dead branches (individuals without children)', () => {
    const parent: Individual = { id: 'I1', name: 'Parent', sex: 'M', familiesAsSpouse: ['F1'], familiesAsChild: [] };
    const child1: Individual = { id: 'I2', name: 'Child 1', sex: 'M', familiesAsSpouse: [], familiesAsChild: ['F1'] };
    const child2: Individual = { id: 'I3', name: 'Child 2', sex: 'F', familiesAsSpouse: [], familiesAsChild: ['F1'] };

    const individuals: Record<string, Individual> = { I1: parent, I2: child1, I3: child2 };
    const families: Record<string, Family> = {
      F1: { id: 'F1', husbandId: 'I1', childrenIds: ['I2', 'I3'] },
    };

    const dead = findDeadBranches(individuals, families);
    const deadIds = dead.map((p) => p.id);
    expect(deadIds).toContain('I2');
    expect(deadIds).toContain('I3');
    expect(deadIds).not.toContain('I1');
  });

  it('computes cohort life expectancy by decade', () => {
    const p1: Individual = {
      id: 'I1',
      name: 'Person 1',
      sex: 'M',
      birth: { parsedDate: { year: 1840, raw: '1840' } },
      death: { parsedDate: { year: 1910, raw: '1910' } }, // 70 ans
      familiesAsSpouse: [],
      familiesAsChild: [],
    };
    const p2: Individual = {
      id: 'I2',
      name: 'Person 2',
      sex: 'F',
      birth: { parsedDate: { year: 1845, raw: '1845' } },
      death: { parsedDate: { year: 1925, raw: '1925' } }, // 80 ans
      familiesAsSpouse: [],
      familiesAsChild: [],
    };

    const cohorts = computeCohortLifeExpectancy({ I1: p1, I2: p2 });
    expect(cohorts.length).toBe(1);
    expect(cohorts[0].decade).toBe(1840);
    expect(cohorts[0].avgAll).toBe(75);
    expect(cohorts[0].avgM).toBe(70);
    expect(cohorts[0].avgF).toBe(80);
  });
});
