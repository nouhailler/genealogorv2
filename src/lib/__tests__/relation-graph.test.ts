import { describe, it, expect } from 'vitest';
import { buildRelationEdges, egoNetwork } from '../relation-graph';
import { Family } from '../../types/genealogy';

// Jean + Marie → Henri ; Henri + Gabrielle → Patrick, Raymonde ; Paul (sans lien)
const families: Family[] = [
  { id: 'F1', husbandId: 'jean', wifeId: 'marie', childrenIds: ['henri'] },
  { id: 'F2', husbandId: 'henri', wifeId: 'gabrielle', childrenIds: ['patrick', 'raymonde'] },
];
const ids = new Set(['jean', 'marie', 'henri', 'gabrielle', 'patrick', 'raymonde', 'paul']);

describe('Graphe relationnel centré sur une personne', () => {
  it('construit les liens de filiation et d\'union selon le filtre', () => {
    const all = buildRelationEdges(families, ids, 'all');
    expect(all.filter(e => e.kind === 'spouse')).toHaveLength(2);
    expect(all.filter(e => e.kind === 'parent')).toHaveLength(6);
    expect(buildRelationEdges(families, ids, 'parents').every(e => e.kind === 'parent')).toBe(true);
    expect(buildRelationEdges(families, ids, 'spouses').every(e => e.kind === 'spouse')).toBe(true);
  });

  it('limite le graphe aux proches et calcule les générations relatives', () => {
    const edges = buildRelationEdges(families, ids, 'all');
    const near = egoNetwork(edges, 'henri', 1);
    expect([...near.keys()].sort()).toEqual(['gabrielle', 'henri', 'jean', 'marie', 'patrick', 'raymonde']);
    expect(near.get('jean')).toEqual({ distance: 1, generation: -1 });
    expect(near.get('gabrielle')).toEqual({ distance: 1, generation: 0 });
    expect(near.get('patrick')).toEqual({ distance: 1, generation: 1 });
  });

  it('atteint la fratrie et les grands-parents à distance 2', () => {
    const edges = buildRelationEdges(families, ids, 'all');
    const two = egoNetwork(edges, 'patrick', 2);
    expect(two.get('raymonde')).toEqual({ distance: 2, generation: 0 });
    expect(two.get('jean')).toEqual({ distance: 2, generation: -2 });
    expect(egoNetwork(edges, 'patrick', 1).has('jean')).toBe(false);
  });

  it('sans limite, inclut tout ce qui est relié et rien d\'autre', () => {
    const edges = buildRelationEdges(families, ids, 'all');
    const all = egoNetwork(edges, 'patrick', null);
    expect(all.size).toBe(6);
    expect(all.has('paul')).toBe(false);
  });
});
