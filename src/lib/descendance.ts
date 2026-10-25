import type { Individual, Family } from '../types/genealogy';

function resolvePerson(id: string, individuals: Record<string, Individual> | Map<string, Individual>): Individual | undefined {
  if (individuals instanceof Map) return individuals.get(id);
  return individuals[id];
}

function resolveFamily(id: string, families: Record<string, Family> | Map<string, Family>): Family | undefined {
  if (families instanceof Map) return families.get(id);
  return families[id];
}

function getBirthYear(person: Individual | undefined): number {
  if (!person) return 9999;
  if (person.birth?.parsedDate?.year) return person.birth.parsedDate.year;
  if (person.birth?.date) {
    const m = person.birth.date.match(/\b\d{4}\b/);
    if (m) return parseInt(m[0], 10);
  }
  return 9999;
}

export function computeAboville(
  rootPerson: Individual,
  individuals: Record<string, Individual> | Map<string, Individual>,
  families: Record<string, Family> | Map<string, Family>,
  maxGen = 10,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!rootPerson) return map;

  map.set(rootPerson.id, '1');

  function visit(personId: string, prefix: string, gen: number) {
    if (gen > maxGen) return;
    const person = resolvePerson(personId, individuals);
    if (!person) return;

    const allChildren: string[] = [];
    const spouseFams = person.familiesAsSpouse || (person as unknown as { fams?: string[] }).fams || [];
    for (const fid of spouseFams) {
      const fam = resolveFamily(fid, families);
      if (!fam) continue;
      const childIds = fam.childrenIds || (fam as unknown as { children?: string[] }).children || [];
      for (const cid of childIds) {
        if (!allChildren.includes(cid)) allChildren.push(cid);
      }
    }

    allChildren.sort((a, b) => {
      const pa = getBirthYear(resolvePerson(a, individuals));
      const pb = getBirthYear(resolvePerson(b, individuals));
      return pa - pb;
    });

    allChildren.forEach((cid, idx) => {
      const code = `${prefix}.${idx + 1}`;
      if (!map.has(cid)) {
        map.set(cid, code);
        visit(cid, code, gen + 1);
      }
    });
  }

  visit(rootPerson.id, '1', 0);
  return map;
}

export function findDeadBranches(
  individuals: Record<string, Individual> | Map<string, Individual>,
  families: Record<string, Family> | Map<string, Family>,
): Individual[] {
  const hasChildren = new Set<string>();
  const famList = families instanceof Map ? Array.from(families.values()) : Object.values(families);
  for (const fam of famList) {
    const childIds = fam.childrenIds || (fam as unknown as { children?: string[] }).children || [];
    if (childIds.length > 0) {
      const h = fam.husbandId || (fam as unknown as { husband?: string }).husband;
      const w = fam.wifeId || (fam as unknown as { wife?: string }).wife;
      if (h) hasChildren.add(h);
      if (w) hasChildren.add(w);
    }
  }
  const personList = individuals instanceof Map ? Array.from(individuals.values()) : Object.values(individuals);
  return personList.filter((p) => !hasChildren.has(p.id));
}

export interface CohortEntry {
  decade: number;
  avgAll: number | null;
  avgM: number | null;
  avgF: number | null;
  countAll: number;
  countM: number;
  countF: number;
}

export function computeCohortLifeExpectancy(
  individuals: Record<string, Individual> | Map<string, Individual>,
): CohortEntry[] {
  const cohorts = new Map<number, { M: number[]; F: number[]; all: number[] }>();
  const personList = individuals instanceof Map ? Array.from(individuals.values()) : Object.values(individuals);

  for (const p of personList) {
    const by = p.birth?.parsedDate?.year ?? (p.birth?.date ? parseInt(p.birth.date.match(/\b\d{4}\b/)?.[0] || '', 10) : undefined);
    const dy = p.death?.parsedDate?.year ?? (p.death?.date ? parseInt(p.death.date.match(/\b\d{4}\b/)?.[0] || '', 10) : undefined);
    if (!by || !dy || isNaN(by) || isNaN(dy)) continue;
    const span = dy - by;
    if (span < 0 || span > 120) continue;
    const decade = Math.floor(by / 10) * 10;
    if (!cohorts.has(decade)) cohorts.set(decade, { M: [], F: [], all: [] });
    const c = cohorts.get(decade)!;
    c.all.push(span);
    if (p.sex === 'M') c.M.push(span);
    else if (p.sex === 'F') c.F.push(span);
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

  const result: CohortEntry[] = [];
  for (const [decade, c] of cohorts) {
    result.push({
      decade,
      avgAll: avg(c.all),
      avgM: avg(c.M),
      avgF: avg(c.F),
      countAll: c.all.length,
      countM: c.M.length,
      countF: c.F.length,
    });
  }

  return result.sort((a, b) => a.decade - b.decade);
}

export const Descendance = { computeAboville, findDeadBranches, computeCohortLifeExpectancy };
