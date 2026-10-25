import { GenealogyData, Individual } from '../types/genealogy';

/**
 * Calcule la numérotation Sosa-Stradonitz pour tous les ancêtres directs du de cujus (racine).
 * 1 = De cujus
 * 2 = Père (2*n)
 * 3 = Mère (2*n + 1)
 */
export function computeSosaNumbers(data: GenealogyData, rootPersonId?: string): Record<string, number> {
  const rootId = rootPersonId || data.rootPersonId;
  if (!rootId || !data.individuals[rootId]) return {};

  const sosaMap: Record<string, number> = { [rootId]: 1 };
  const queue: Array<{ id: string; sosa: number; gen: number }> = [{ id: rootId, sosa: 1, gen: 1 }];

  while (queue.length > 0) {
    const { id, sosa } = queue.shift()!;
    const person = data.individuals[id];
    if (!person) continue;

    for (const famId of person.familiesAsChild) {
      const fam = data.families[famId];
      if (!fam) continue;

      if (fam.husbandId && !sosaMap[fam.husbandId]) {
        const fatherSosa = sosa * 2;
        sosaMap[fam.husbandId] = fatherSosa;
        queue.push({ id: fam.husbandId, sosa: fatherSosa, gen: Math.floor(Math.log2(fatherSosa)) + 1 });
      }

      if (fam.wifeId && !sosaMap[fam.wifeId]) {
        const motherSosa = sosa * 2 + 1;
        sosaMap[fam.wifeId] = motherSosa;
        queue.push({ id: fam.wifeId, sosa: motherSosa, gen: Math.floor(Math.log2(motherSosa)) + 1 });
      }
    }
  }

  return sosaMap;
}

export function computeGeneration(sosa: number): number {
  if (sosa <= 0) return 0;
  return Math.floor(Math.log2(sosa)) + 1;
}

export function getAncestorLineage(data: GenealogyData, personId: string): Individual[] {
  const ancestors: Individual[] = [];
  const visited = new Set<string>();

  function traverse(id: string) {
    if (!id || visited.has(id)) return;
    visited.add(id);
    const ind = data.individuals[id];
    if (!ind) return;
    ancestors.push(ind);

    for (const famId of ind.familiesAsChild) {
      const fam = data.families[famId];
      if (fam) {
        if (fam.husbandId) traverse(fam.husbandId);
        if (fam.wifeId) traverse(fam.wifeId);
      }
    }
  }

  traverse(personId);
  return ancestors;
}
