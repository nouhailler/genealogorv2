/**
 * Graphe relationnel centré sur une personne : liens de filiation et d'union, proches jusqu'à une
 * distance donnée, et génération relative de chacun (pour placer les ancêtres au-dessus, les descendants
 * au-dessous et les conjoints côte à côte).
 */

import { Family } from '../types/genealogy';

export type LinkFilter = 'all' | 'parents' | 'spouses';

export interface RelationEdge {
  /** Filiation : a = parent, b = enfant ; union : a et b sont conjoints */
  a: string;
  b: string;
  kind: 'parent' | 'spouse';
}

export interface EgoMember {
  /** Nombre de liens depuis la personne centrale */
  distance: number;
  /** Génération relative : -1 parents, +1 enfants, 0 conjoints et fratrie */
  generation: number;
}

export function buildRelationEdges(families: Family[], personIds: Set<string>, filter: LinkFilter): RelationEdge[] {
  const edges: RelationEdge[] = [];
  for (const f of families) {
    const parents = [f.husbandId, f.wifeId].filter((id): id is string => !!id && personIds.has(id));
    if (filter !== 'parents' && parents.length === 2) {
      edges.push({ a: parents[0], b: parents[1], kind: 'spouse' });
    }
    if (filter !== 'spouses') {
      for (const childId of f.childrenIds || []) {
        if (!personIds.has(childId)) continue;
        for (const parentId of parents) edges.push({ a: parentId, b: childId, kind: 'parent' });
      }
    }
  }
  return edges;
}

/**
 * Proches de la personne (parcours en largeur sur les liens), jusqu'à `maxDistance` liens
 * (null = tout ce qui est relié). La génération suit le premier chemin trouvé (le plus court).
 */
export function egoNetwork(edges: RelationEdge[], centerId: string, maxDistance: number | null): Map<string, EgoMember> {
  const neighbours = new Map<string, Array<{ id: string; delta: number }>>();
  const add = (from: string, to: string, delta: number) => {
    const list = neighbours.get(from) || [];
    list.push({ id: to, delta });
    neighbours.set(from, list);
  };
  for (const e of edges) {
    if (e.kind === 'parent') {
      add(e.a, e.b, +1); // du parent vers l'enfant : une génération plus bas
      add(e.b, e.a, -1);
    } else {
      add(e.a, e.b, 0);
      add(e.b, e.a, 0);
    }
  }

  const members = new Map<string, EgoMember>([[centerId, { distance: 0, generation: 0 }]]);
  const queue = [centerId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const current = members.get(id)!;
    if (maxDistance !== null && current.distance >= maxDistance) continue;
    for (const next of neighbours.get(id) || []) {
      if (members.has(next.id)) continue;
      members.set(next.id, { distance: current.distance + 1, generation: current.generation + next.delta });
      queue.push(next.id);
    }
  }
  return members;
}
