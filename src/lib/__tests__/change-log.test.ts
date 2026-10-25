import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../gedcom-parser';
import {
  diffTreeStates,
  appendChanges,
  filterChangesForShare,
  describeChange,
  getUnreadChanges,
  allReadState,
  isChangeNavigable,
  stableStringify,
  MAX_CHANGE_LOG,
  TreeState,
  ChangeEvent,
} from '../change-log';
import { ArchiveDocument, GenealogyData } from '../../types/genealogy';

const GED = `0 HEAD
0 @I1@ INDI
1 NAME Gabrielle /Coste/
1 SEX F
1 BIRT
2 DATE 1995
1 FAMC @F1@
0 @I2@ INDI
1 NAME Henri /Coste/
1 SEX M
1 BIRT
2 DATE 1905
1 DEAT
2 DATE 1982
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
1 CHIL @I1@
0 TRLR
`;

const base: GenealogyData = { ...parseGedcom(GED), rootPersonId: '@I2@' };
const photo: ArchiveDocument = {
  id: 'doc-1', title: 'Photo de famille 1912', type: 'photo' as any,
  linkedPersonIds: ['@I2@'], linkedFamilyIds: [], photoTags: [], createdAt: 0, updatedAt: 0,
};

const state = (data: GenealogyData, archives: ArchiveDocument[] = [photo]): TreeState => ({ data, archives });
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

describe('Journal des modifications et alertes', () => {
  it('ne signale rien quand l\'arbre est identique, même avec des clés réordonnées (relecture Firestore)', () => {
    const reordered = clone(base);
    const henri = reordered.individuals['@I2@'];
    reordered.individuals['@I2@'] = Object.fromEntries(Object.entries(henri).reverse()) as any;
    expect(diffTreeStates(state(base), state(reordered))).toEqual([]);
  });

  it('signale une fiche ajoutée', () => {
    const next = clone(base);
    next.individuals['@I3@'] = { ...next.individuals['@I2@'], id: '@I3@', name: 'Jean Coste' };
    const [e] = diffTreeStates(state(base), state(next));
    expect(e).toMatchObject({ kind: 'person:add', targetType: 'person', targetId: '@I3@' });
    expect(describeChange(e, next)).toBe('Nouvelle fiche : Jean Coste');
  });

  it('signale une fiche modifiée avec les rubriques concernées', () => {
    const next = clone(base);
    next.individuals['@I2@'].death = { date: '19 OCT 1982', place: 'Limoges' };
    next.individuals['@I2@'].occupations = ['Cultivateur'];
    const [e] = diffTreeStates(state(base), state(next));
    expect(e.kind).toBe('person:edit');
    expect(e.fields).toEqual(expect.arrayContaining(['décès', 'profession']));
    expect(describeChange(e, next)).toBe('Fiche modifiée : Henri Coste (décès, profession)');
  });

  it('ignore les champs calculés (numéro Sosa)', () => {
    const next = clone(base);
    next.individuals['@I2@'].sosaNumber = 1;
    expect(diffTreeStates(state(base), state(next))).toEqual([]);
  });

  it('signale une personne identifiée sur une photo', () => {
    const tagged = { ...photo, photoTags: [{ id: 't1', personId: '@I1@', x: 10, y: 20 }] };
    const events = diffTreeStates(state(base), state(base, [tagged]));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'photo:tag', targetType: 'archive', targetId: 'doc-1', personId: '@I1@' });
    expect(describeChange(events[0], base)).toBe('Gabrielle Coste identifié(e) sur la photo « Photo de famille 1912 »');
  });

  it('signale archives ajoutées, modifiées et supprimées, sans tenir compte de createdBy', () => {
    const added = { ...photo, id: 'doc-2', title: 'Acte de mariage' };
    expect(diffTreeStates(state(base), state(base, [photo, added]))[0].kind).toBe('archive:add');
    expect(diffTreeStates(state(base), state(base, [{ ...photo, transcription: 'Texte' }]))[0].kind).toBe('archive:edit');
    expect(diffTreeStates(state(base), state(base, []))[0].kind).toBe('archive:delete');
    expect(diffTreeStates(state(base), state(base, [{ ...photo, createdBy: 'uid' } as any]))).toEqual([]);
  });

  it('regroupe un import massif en une seule alerte', () => {
    const next = clone(base);
    for (let i = 0; i < 40; i++) next.individuals[`@X${i}@`] = { ...next.individuals['@I2@'], id: `@X${i}@` };
    const events = diffTreeStates(state(base), state(next));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'bulk', targetId: '@I2@', counts: { added: 40, edited: 0, deleted: 0 } });
    expect(describeChange(events[0])).toContain('40 fiche(s) ajoutée(s)');
  });

  it('borne le journal et place les événements récents en tête', () => {
    const many = Array.from({ length: MAX_CHANGE_LOG + 10 }, (_, i) => ({
      id: `c${i}`, at: i, kind: 'person:edit', targetType: 'person', targetId: '@I2@',
    } as ChangeEvent));
    const log = appendChanges([], many);
    expect(log).toHaveLength(MAX_CHANGE_LOG);
    expect(log[0].id).toBe(`c${MAX_CHANGE_LOG + 9}`);
  });

  it('ne transmet aux liens que la branche partagée, avec les noms anonymisés', () => {
    const log: ChangeEvent[] = [
      { id: 'a', at: 1, kind: 'person:edit', targetType: 'person', targetId: '@I1@', name: 'Gabrielle Coste' },
      { id: 'b', at: 2, kind: 'person:edit', targetType: 'person', targetId: '@HORS@', name: 'Hors branche' },
      { id: 'c', at: 3, kind: 'person:delete', targetType: 'person', targetId: '@I9@', name: 'Vivant supprimé' },
    ];
    const sharedTree = clone(base);
    sharedTree.individuals['@I1@'].name = 'Coste [Privé]';
    const out = filterChangesForShare(log, sharedTree, [photo], true);
    expect(out.map(e => e.id)).toEqual(['a', 'c']);
    expect(out[0].name).toBe('Coste [Privé]');
    expect(out[1].name).toBeUndefined();
    expect(describeChange(out[1])).toBe('Une fiche a été supprimée');
  });

  it('calcule les alertes non lues et le « tout marquer comme lu »', () => {
    const log: ChangeEvent[] = [
      { id: 'new2', at: 30, kind: 'person:edit', targetType: 'person', targetId: '@I2@' },
      { id: 'new1', at: 20, kind: 'person:add', targetType: 'person', targetId: '@I1@' },
      { id: 'old', at: 5, kind: 'person:edit', targetType: 'person', targetId: '@I2@' },
    ];
    expect(getUnreadChanges(log, null)).toEqual([]);
    const state1 = { lastSeenAt: 10, readIds: ['new1'] };
    expect(getUnreadChanges(log, state1).map(e => e.id)).toEqual(['new2']);
    expect(getUnreadChanges(log, allReadState(log, state1))).toEqual([]);
  });

  it('ne propose pas d\'aller vers un élément supprimé', () => {
    const del: ChangeEvent = { id: 'd', at: 1, kind: 'person:delete', targetType: 'person', targetId: '@I2@' };
    const edit: ChangeEvent = { id: 'e', at: 1, kind: 'person:edit', targetType: 'person', targetId: '@I2@' };
    expect(isChangeNavigable(del, base, [photo])).toBe(false);
    expect(isChangeNavigable(edit, base, [photo])).toBe(true);
  });

  it('sérialise de façon stable quel que soit l\'ordre des clés', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: undefined } })).toBe(stableStringify({ a: { d: 2 }, b: 1 }));
  });
});
