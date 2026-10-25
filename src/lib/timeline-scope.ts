/**
 * Périmètre de la chronologie à partir d'une fiche : la personne et ses ascendants, ou la personne
 * et ses descendants, avec la distance en générations de chacun (pour libeller le lien de parenté).
 */

import { GenealogyData, Sex } from '../types/genealogy';

export type TimelineScope = 'ascendants' | 'descendants' | 'all';

/**
 * Retourne les membres de la lignée avec leur distance à la personne :
 * 0 = la personne, +n = ascendant à n générations, -n = descendant à n générations.
 * En cas d'implexe, la distance la plus courte est retenue.
 */
export function getLineageDepths(
  data: GenealogyData,
  personId: string,
  scope: Exclude<TimelineScope, 'all'>
): Map<string, number> {
  const depths = new Map<string, number>();
  if (!data.individuals[personId]) return depths;
  depths.set(personId, 0);
  const queue: Array<[string, number]> = [[personId, 0]];

  while (queue.length > 0) {
    const [id, depth] = queue.shift()!;
    const person = data.individuals[id];
    if (!person) continue;
    const nextIds: string[] = [];

    if (scope === 'ascendants') {
      for (const famId of person.familiesAsChild) {
        const fam = data.families[famId];
        if (fam?.husbandId) nextIds.push(fam.husbandId);
        if (fam?.wifeId) nextIds.push(fam.wifeId);
      }
    } else {
      for (const famId of person.familiesAsSpouse) {
        nextIds.push(...(data.families[famId]?.childrenIds || []));
      }
    }

    const nextDepth = scope === 'ascendants' ? depth + 1 : depth - 1;
    for (const nextId of nextIds) {
      if (!data.individuals[nextId] || depths.has(nextId)) continue;
      depths.set(nextId, nextDepth);
      queue.push([nextId, nextDepth]);
    }
  }
  return depths;
}

/** Lien de parenté avec la personne de référence (« Grand-mère », « Petit-fils »…) */
export function relationLabel(depth: number, sex: Sex): string {
  if (depth === 0) return 'Personne de référence';
  const n = Math.abs(depth);
  const m = sex === 'M';
  const f = sex === 'F';

  if (depth > 0) {
    if (n === 1) return m ? 'Père' : f ? 'Mère' : 'Parent';
    if (n === 2) return m ? 'Grand-père' : f ? 'Grand-mère' : 'Grand-parent';
    if (n === 3) return m ? 'Arrière-grand-père' : f ? 'Arrière-grand-mère' : 'Arrière-grand-parent';
    return `Ancêtre · ${n}e génération`;
  }
  if (n === 1) return m ? 'Fils' : f ? 'Fille' : 'Enfant';
  if (n === 2) return m ? 'Petit-fils' : f ? 'Petite-fille' : 'Petit-enfant';
  if (n === 3) return m ? 'Arrière-petit-fils' : f ? 'Arrière-petite-fille' : 'Arrière-petit-enfant';
  return `Descendant · ${n}e génération`;
}
