import { describe, it, expect } from 'vitest';
import {
  sanitizeSubmission,
  sealSubmission,
  openSubmission,
  flattenSubmission,
  withoutItems,
  dateFromSubmission,
  newProposalId,
  suggestPersons,
  PROPOSAL_LIMITS,
} from '../photo-proposals';
import { generateShareKey } from '../share-snapshot';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const submission = {
  items: [
    { x: 41.234, y: 50, name: '  Jeannot   Coste ', details: 'le marié' },
    { x: 58, y: 52, name: 'Renée Boisseaux' },
  ],
  proposer: 'Cousine Marie',
  comment: 'Photo prise à Saint-Pierre-de-Frugie',
};

describe('sanitizeSubmission', () => {
  it('nettoie les textes et borne les positions', () => {
    const clean = sanitizeSubmission({
      items: [
        { x: -5, y: 140, name: 'A' },
        { x: 10, y: 10, name: '   ' },               // sans nom : retiré
        { x: 'a', y: 10, name: 'B' },                 // position invalide : retiré
        { x: 20, y: 30, name: 'x'.repeat(500), details: 'y'.repeat(1000), extra: 'ignoré' },
      ],
      proposer: 'p'.repeat(200),
      evil: '<script>',
    });
    expect(clean.items).toHaveLength(2);
    expect(clean.items[0]).toEqual({ x: 0, y: 100, name: 'A' });
    expect(clean.items[1].name).toHaveLength(PROPOSAL_LIMITS.NAME);
    expect(clean.items[1].details).toHaveLength(PROPOSAL_LIMITS.DETAILS);
    expect(clean.items[1]).not.toHaveProperty('extra');
    expect(clean.proposer).toHaveLength(PROPOSAL_LIMITS.PROPOSER);
    expect(clean).not.toHaveProperty('evil');
  });

  it('limite le nombre de propositions par envoi', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ x: i, y: i, name: `P${i}` }));
    expect(sanitizeSubmission({ items: many }).items).toHaveLength(PROPOSAL_LIMITS.MAX_ITEMS);
  });
});

describe('chiffrement avec la clé du lien', () => {
  it('aller-retour : seul le détenteur de la clé peut lire', async () => {
    const key = generateShareKey();
    const { payload, count } = await sealSubmission(submission, key);
    expect(count).toBe(2);
    expect(payload).not.toContain('Coste');
    expect(payload.length).toBeLessThan(PROPOSAL_LIMITS.MAX_PAYLOAD_CHARS);
    const opened = await openSubmission(payload, key);
    expect(opened).toEqual({
      items: [{ x: 41.23, y: 50, name: 'Jeannot Coste', details: 'le marié' }, { x: 58, y: 52, name: 'Renée Boisseaux' }],
      proposer: 'Cousine Marie',
      comment: 'Photo prise à Saint-Pierre-de-Frugie',
    });
    await expect(openSubmission(payload, generateShareKey())).rejects.toThrow();
  });

  it('refuse un envoi vide', async () => {
    await expect(sealSubmission({ items: [] }, generateShareKey())).rejects.toThrow('Aucune proposition');
  });

  it('un envoi maximal reste sous la limite des règles Firestore', async () => {
    const max = {
      items: Array.from({ length: PROPOSAL_LIMITS.MAX_ITEMS }, (_, i) => ({
        x: 12.34, y: 56.78, name: 'é'.repeat(PROPOSAL_LIMITS.NAME), details: 'à'.repeat(PROPOSAL_LIMITS.DETAILS),
      })),
      date: { value: 'd'.repeat(PROPOSAL_LIMITS.DATE), note: 'é'.repeat(PROPOSAL_LIMITS.DATE_NOTE) },
      proposer: 'n'.repeat(PROPOSAL_LIMITS.PROPOSER),
      comment: 'c'.repeat(PROPOSAL_LIMITS.COMMENT),
    };
    // Tous les champs au maximum (caractères accentués) : l'envoi doit toujours passer
    const { payload, count } = await sealSubmission(max, generateShareKey());
    expect(count).toBe(PROPOSAL_LIMITS.MAX_ITEMS);
    expect(payload.length).toBeLessThanOrEqual(PROPOSAL_LIMITS.MAX_PAYLOAD_CHARS);
  });
});

describe('date proposée pour la photo', () => {
  it('peut être envoyée seule, chiffrée, et compte pour 1', async () => {
    const key = generateShareKey();
    const { payload, count } = await sealSubmission({ items: [], date: { value: '  juin   1952 ', note: 'mariage de Jean et Renée' }, proposer: 'Robert' }, key);
    expect(count).toBe(1);
    const opened = await openSubmission(payload, key);
    expect(opened).toEqual({ items: [], date: { value: 'juin 1952', note: 'mariage de Jean et Renée' }, proposer: 'Robert' });
    expect(dateFromSubmission('shr-a', 'prp-1', opened, 5)).toMatchObject({ key: 'shr-a/prp-1/date', value: 'juin 1952', proposer: 'Robert', submittedAt: 5 });
  });

  it('est ignorée si vide, et tronquée si trop longue', () => {
    expect(sanitizeSubmission({ items: [], date: { value: '   ' } })).toEqual({ items: [] });
    expect(sanitizeSubmission({ items: [], date: { value: 'x'.repeat(200) } }).date!.value).toHaveLength(PROPOSAL_LIMITS.DATE);
    expect(dateFromSubmission('t', 'd', { items: [] })).toBeNull();
  });

  it('se retire séparément des visages', () => {
    const both = sanitizeSubmission({ ...submission, date: { value: '1952' } });
    const onlyFaces = withoutItems(both, [], true)!;
    expect(onlyFaces.date).toBeUndefined();
    expect(onlyFaces.items).toHaveLength(2);
    const onlyDate = withoutItems(both, [0, 1])!;
    expect(onlyDate).toMatchObject({ items: [], date: { value: '1952' } });
    expect(withoutItems(onlyDate, [], true)).toBeNull();
  });
});

describe('examen par l\'administrateur', () => {
  it('aplatit un envoi en propositions identifiées', () => {
    const flat = flattenSubmission('shr-abc', 'prp-1', sanitizeSubmission(submission), 1700000000000);
    expect(flat.map(f => f.key)).toEqual(['shr-abc/prp-1/0', 'shr-abc/prp-1/1']);
    expect(flat[1]).toMatchObject({ name: 'Renée Boisseaux', proposer: 'Cousine Marie', submittedAt: 1700000000000, index: 1 });
  });

  it('retire les propositions traitées ; null quand il n\'en reste plus', () => {
    const clean = sanitizeSubmission(submission);
    expect(withoutItems(clean, [0])!.items.map(i => i.name)).toEqual(['Renée Boisseaux']);
    expect(withoutItems(clean, [0, 1])).toBeNull();
  });

  it('suggère les personnes de l\'arbre au nom proche (accents et casse ignorés)', () => {
    const persons = [
      { id: '1', name: 'Jean Coste' },
      { id: '2', name: 'Renée Boisseaux' },
      { id: '3', name: 'Jeannot Coste' },
      { id: '4', name: 'Marie Lamy' },
    ];
    expect(suggestPersons('jeannot coste', persons).map(p => p.id)).toEqual(['3', '1']);
    expect(suggestPersons('Renee BOISSEAUX', persons).map(p => p.id)).toEqual(['2']);
    expect(suggestPersons('Inconnu', persons)).toEqual([]);
  });

  it('identifiant de document conforme aux règles', () => {
    const id = newProposalId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(newProposalId()).not.toBe(id);
  });
});

describe('règles Firestore', () => {
  const rules = readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8');
  it('autorisent le dépôt anonyme contrôlé et réservent la lecture au créateur du lien', () => {
    const block = rules.slice(rules.indexOf('match /proposals/{proposalId}'));
    expect(block).toMatch(/allow create: if isValidId\(token\)/);
    expect(block).toContain("request.resource.data.keys().hasOnly(['payload', 'createdAt', 'count'])");
    expect(block).toContain('request.resource.data.payload.size() < 30000');
    expect(block).toContain('request.resource.data.createdAt == request.time');
    expect(block).toMatch(/allow read, delete: if isShareOwner\(\);/);
    expect(PROPOSAL_LIMITS.MAX_PAYLOAD_CHARS).toBeLessThan(30000);
    expect(block).toContain(`request.resource.data.count <= ${PROPOSAL_LIMITS.MAX_ITEMS}`);
  });
});
