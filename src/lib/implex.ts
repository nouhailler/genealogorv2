import type { Individual, Family } from '../types/genealogy';

export interface ImplexEntry {
  sosaNumbers: number[];
  generations: number[];
  person: Individual;
}

export interface GenerationStat {
  generation: number;
  theoretical: number;
  present: number;
  distinct: number;
  completeness: number;
  endogamyRate: number;
}

export interface ImplexResult {
  occurrences: Map<string, ImplexEntry>;
  implexEntries: ImplexEntry[];
  generationStats: GenerationStat[];
  globalEndogamy: number;
  totalAncestorSlots: number;
  distinctAncestors: number;
  sosaToId: Map<number, string>;
}

function resolvePerson(id: string, individuals: Record<string, Individual> | Map<string, Individual>): Individual | undefined {
  if (individuals instanceof Map) return individuals.get(id);
  return individuals[id];
}

function resolveFamily(id: string, families: Record<string, Family> | Map<string, Family>): Family | undefined {
  if (families instanceof Map) return families.get(id);
  return families[id];
}

export function compute(
  rootPerson: Individual,
  individuals: Record<string, Individual> | Map<string, Individual>,
  families: Record<string, Family> | Map<string, Family>,
  maxGen = 10,
): ImplexResult {
  const occurrences = new Map<string, ImplexEntry>();
  const sosaToId = new Map<number, string>();

  function visit(personId: string, sosa: number, gen: number) {
    if (!personId || gen > maxGen) return;
    const person = resolvePerson(personId, individuals);
    if (!person) return;

    sosaToId.set(sosa, personId);

    if (!occurrences.has(personId)) {
      occurrences.set(personId, { sosaNumbers: [], generations: [], person });
    }
    const entry = occurrences.get(personId)!;
    entry.sosaNumbers.push(sosa);
    entry.generations.push(gen);

    const childFams = person.familiesAsChild || (person as unknown as { famc?: string[] }).famc || [];
    const famId = childFams[0];
    if (!famId) return;

    const fam = resolveFamily(famId, families);
    if (!fam) return;

    const husband = fam.husbandId || (fam as unknown as { husband?: string }).husband;
    const wife = fam.wifeId || (fam as unknown as { wife?: string }).wife;

    if (husband) visit(husband, sosa * 2, gen + 1);
    if (wife) visit(wife, sosa * 2 + 1, gen + 1);
  }

  visit(rootPerson.id, 1, 0);

  const implexEntries = Array.from(occurrences.values())
    .filter((e) => e.sosaNumbers.length > 1)
    .sort((a, b) => b.sosaNumbers.length - a.sosaNumbers.length);

  const perGen = new Map<number, { distinct: Set<string>; total: number }>();
  for (const [sosa, id] of sosaToId) {
    const gen = Math.floor(Math.log2(sosa));
    if (!perGen.has(gen)) perGen.set(gen, { distinct: new Set(), total: 0 });
    const g = perGen.get(gen)!;
    g.distinct.add(id);
    g.total++;
  }

  const generationStats: GenerationStat[] = [];
  for (let g = 0; g <= maxGen; g++) {
    const data = perGen.get(g);
    const theoretical = Math.pow(2, g);
    const present = data ? data.total : 0;
    const distinct = data ? data.distinct.size : 0;
    generationStats.push({
      generation: g,
      theoretical,
      present,
      distinct,
      completeness: theoretical > 0 ? (present / theoretical) * 100 : 0,
      endogamyRate: present > 0 ? ((present - distinct) / present) * 100 : 0,
    });
  }

  let totalSlots = 0;
  const distinctTotal = new Set<string>();
  for (const [, id] of sosaToId) {
    totalSlots++;
    distinctTotal.add(id);
  }

  const globalEndogamy =
    totalSlots > 0 ? ((totalSlots - distinctTotal.size) / totalSlots) * 100 : 0;

  return {
    occurrences,
    implexEntries,
    generationStats,
    globalEndogamy,
    totalAncestorSlots: totalSlots,
    distinctAncestors: distinctTotal.size,
    sosaToId,
  };
}

export function isImplexedFor(personId: string, implexData: ImplexResult | null): boolean {
  const e = implexData?.occurrences?.get(personId);
  return !!(e && e.sosaNumbers.length > 1);
}

export const Implex = { compute, isImplexedFor };
