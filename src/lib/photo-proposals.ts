/**
 * Propositions d'identification envoyées depuis une photo partagée.
 *
 * Un visiteur du lien place des repères sur des visages et indique qui c'est (texte libre : il ne voit pas
 * l'arbre). L'envoi est chiffré avec la clé du lien (`#k=…`) et déposé dans Firestore sous
 * `/shares/{jeton}/proposals/{id}` ; seul le créateur du lien peut le lire. L'administrateur examine
 * ensuite chaque proposition : associer à une personne de l'arbre, garder « à créer plus tard », ou refuser.
 * Une proposition ne crée jamais de personne.
 */

import { decryptData, encryptData } from './crypto';

export const PROPOSAL_LIMITS = {
  MAX_ITEMS: 20,
  NAME: 120,
  DETAILS: 300,
  PROPOSER: 80,
  COMMENT: 500,
  /** Doit rester sous la limite des règles Firestore (30 000) */
  MAX_PAYLOAD_CHARS: 28_000,
};

export interface ProposalItem {
  /** Position du visage en % de l'image */
  x: number;
  y: number;
  /** Qui est-ce, selon le visiteur */
  name: string;
  /** Années, lien de parenté… */
  details?: string;
}

export interface ProposalSubmission {
  items: ProposalItem[];
  proposer?: string;
  comment?: string;
}

/** Proposition déchiffrée, telle que l'administrateur l'examine */
export interface ReceivedProposalItem extends ProposalItem {
  /** `<jeton>/<document>/<rang>` */
  key: string;
  token: string;
  docId: string;
  index: number;
  proposer?: string;
  comment?: string;
  submittedAt?: number;
}

const clip = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const v = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return v || undefined;
};
const clamp = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 100) / 100)) : NaN);

/** Nettoie un envoi (textes tronqués, positions bornées, éléments invalides retirés) */
export function sanitizeSubmission(raw: unknown): ProposalSubmission {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const items: ProposalItem[] = [];
  for (const it of Array.isArray(r.items) ? r.items : []) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const name = clip(o.name, PROPOSAL_LIMITS.NAME);
    const x = clamp(o.x), y = clamp(o.y);
    if (!name || Number.isNaN(x) || Number.isNaN(y)) continue;
    const details = clip(o.details, PROPOSAL_LIMITS.DETAILS);
    items.push({ x, y, name, ...(details ? { details } : {}) });
    if (items.length >= PROPOSAL_LIMITS.MAX_ITEMS) break;
  }
  const proposer = clip(r.proposer, PROPOSAL_LIMITS.PROPOSER);
  const comment = typeof r.comment === 'string' ? r.comment.trim().slice(0, PROPOSAL_LIMITS.COMMENT) || undefined : undefined;
  return { items, ...(proposer ? { proposer } : {}), ...(comment ? { comment } : {}) };
}

/** Chiffre un envoi avec la clé du lien */
export async function sealSubmission(submission: ProposalSubmission, shareKey: string): Promise<{ payload: string; count: number }> {
  const clean = sanitizeSubmission(submission);
  if (clean.items.length === 0) throw new Error('Aucune proposition à envoyer.');
  const payload = await encryptData(JSON.stringify({ v: 1, ...clean }), shareKey);
  if (payload.length > PROPOSAL_LIMITS.MAX_PAYLOAD_CHARS) throw new Error('Envoi trop volumineux : réduisez les commentaires.');
  return { payload, count: clean.items.length };
}

export async function openSubmission(payload: string, shareKey: string): Promise<ProposalSubmission> {
  return sanitizeSubmission(JSON.parse(await decryptData(payload, shareKey)));
}

/** Aplatit un envoi reçu en propositions examinables une à une */
export function flattenSubmission(token: string, docId: string, submission: ProposalSubmission, submittedAt?: number): ReceivedProposalItem[] {
  return submission.items.map((item, index) => ({
    ...item,
    key: `${token}/${docId}/${index}`,
    token,
    docId,
    index,
    ...(submission.proposer ? { proposer: submission.proposer } : {}),
    ...(submission.comment ? { comment: submission.comment } : {}),
    ...(submittedAt ? { submittedAt } : {}),
  }));
}

/** Envoi après retrait des propositions traitées ; null s'il n'en reste plus (document à supprimer) */
export function withoutItems(submission: ProposalSubmission, handledIndexes: number[]): ProposalSubmission | null {
  const handled = new Set(handledIndexes);
  const items = submission.items.filter((_, i) => !handled.has(i));
  return items.length ? { ...submission, items } : null;
}

/** Identifiant de document aléatoire (règles : ≥ 16 caractères, [A-Za-z0-9_-]) */
export function newProposalId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'prp-' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Personnes de l'arbre les plus proches d'un nom proposé (mots en commun), pour pré-remplir l'association.
 * Score : part des mots du nom proposé retrouvés dans le nom de la personne.
 */
export function suggestPersons<T extends { id: string; name: string }>(proposedName: string, persons: T[], limit = 5): T[] {
  const words = norm(proposedName).split(' ').filter(w => w.length > 1);
  if (words.length === 0) return [];
  return persons
    .map(p => {
      const target = norm(p.name).split(' ');
      const hits = words.filter(w => target.some(t => t === w || (w.length >= 4 && t.startsWith(w)))).length;
      return { p, score: hits / words.length };
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map(s => s.p);
}
