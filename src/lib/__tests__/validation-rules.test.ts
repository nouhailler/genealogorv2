import { describe, it, expect } from 'vitest';
import { runFullValidation } from '../validation-checker';
import type { Individual, Family } from '../../types/genealogy';

describe('Validation Checker & Cycle Detection', () => {
  it('detects ancestral cycles when a person is their own ancestor', () => {
    // Cycle: I1 -> child is I2 -> child is I3 -> parent of I1
    const p1: Individual = { id: 'I1', name: 'Person 1', sex: 'M', familiesAsSpouse: ['F1'], familiesAsChild: ['F3'] };
    const p2: Individual = { id: 'I2', name: 'Person 2', sex: 'M', familiesAsSpouse: ['F2'], familiesAsChild: ['F1'] };
    const p3: Individual = { id: 'I3', name: 'Person 3', sex: 'M', familiesAsSpouse: ['F3'], familiesAsChild: ['F2'] };

    const individuals = { I1: p1, I2: p2, I3: p3 };
    const families = {
      F1: { id: 'F1', husbandId: 'I1', childrenIds: ['I2'] },
      F2: { id: 'F2', husbandId: 'I2', childrenIds: ['I3'] },
      F3: { id: 'F3', husbandId: 'I3', childrenIds: ['I1'] }, // CYCLE!
    };

    const res = runFullValidation({ individuals, families });
    const cycleIssues = res.issues.filter((i) => i.code === 'ancestral-cycle');
    expect(cycleIssues.length).toBeGreaterThan(0);
    expect(res.errorsCount).toBeGreaterThan(0);
  });

  it('detects chronological anomalies like death before birth', () => {
    const p: Individual = {
      id: 'I1',
      name: 'Anachronistic Person',
      sex: 'M',
      birth: { parsedDate: { year: 1850, raw: '1850' } },
      death: { parsedDate: { year: 1820, raw: '1820' } }, // Death before birth!
      familiesAsSpouse: [],
      familiesAsChild: [],
    };

    const res = runFullValidation({ individuals: { I1: p }, families: {} });
    const deathIssues = res.issues.filter((i) => i.code === 'death-before-birth');
    expect(deathIssues.length).toBe(1);
    expect(deathIssues[0].severity).toBe('error');
  });

  it('detects impossible parent age at child birth', () => {
    const parent: Individual = {
      id: 'I1',
      name: 'Too Young Father',
      sex: 'M',
      birth: { parsedDate: { year: 1850, raw: '1850' } },
      familiesAsSpouse: ['F1'],
      familiesAsChild: [],
    };
    const child: Individual = {
      id: 'I2',
      name: 'Early Child',
      sex: 'M',
      birth: { parsedDate: { year: 1858, raw: '1858' } }, // Father was only 8!
      familiesAsSpouse: [],
      familiesAsChild: ['F1'],
    };

    const families = {
      F1: { id: 'F1', husbandId: 'I1', childrenIds: ['I2'] },
    };

    const res = runFullValidation({ individuals: { I1: parent, I2: child }, families });
    const ageIssues = res.issues.filter((i) => i.code === 'parent-too-young');
    expect(ageIssues.length).toBe(1);
    expect(ageIssues[0].severity).toBe('error');
  });

  it('computes completeness percentages per category', () => {
    const p1: Individual = {
      id: 'I1',
      name: 'Complete Person',
      sex: 'M',
      birth: { parsedDate: { year: 1880, raw: '1880' }, place: 'Paris' },
      death: { parsedDate: { year: 1950, raw: '1950' }, place: 'Lyon' },
      occupations: ['Artisan'],
      familiesAsSpouse: [],
      familiesAsChild: ['F1'],
    };
    const p2: Individual = {
      id: 'I2',
      name: 'Incomplete Person',
      sex: 'F',
      familiesAsSpouse: [],
      familiesAsChild: [],
    };

    const res = runFullValidation({ individuals: { I1: p1, I2: p2 }, families: {} });
    expect(res.completeness).toHaveLength(6);
    const birthDateStat = res.completeness.find((c) => c.field === 'birthDate');
    expect(birthDateStat?.pct).toBe(50); // 1 out of 2
  });
});
