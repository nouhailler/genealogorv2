/**
 * Journal des modifications de l'arbre, à l'origine des alertes affichées aux utilisateurs.
 *
 * Le journal est produit par comparaison de deux versions successives de l'arbre (fiches, unions,
 * archives, repérages photo) chez le créateur, conservé localement par arbre, puis diffusé avec
 * l'instantané de chaque lien de partage. Chaque destinataire affiche les événements qu'il n'a pas lus.
 */

import { ArchiveDocument, GenealogyData, Individual } from '../types/genealogy';

export type ChangeKind =
  | 'person:add'
  | 'person:edit'
  | 'person:delete'
  | 'family:edit'
  | 'archive:add'
  | 'archive:edit'
  | 'archive:delete'
  | 'photo:tag'
  | 'bulk';

export interface ChangeEvent {
  id: string;
  at: number;
  kind: ChangeKind;
  targetType: 'person' | 'archive';
  /** Fiche ou archive à ouvrir au clic */
  targetId: string;
  /** Nom de la fiche ou titre de l'archive au moment de la modification */
  name?: string;
  /** Rubriques modifiées (« naissance », « décès »…) */
  fields?: string[];
  /** Personne repérée sur une photo (photo:tag) */
  personId?: string;
  personName?: string;
  /** Mise à jour massive (import GEDCOM, restauration) */
  counts?: { added: number; edited: number; deleted: number };
}

export interface TreeState {
  data: GenealogyData;
  archives: ArchiveDocument[];
}

export const MAX_CHANGE_LOG = 100;
/** Au-delà, les événements sont regroupés en une seule alerte (import, restauration…) */
export const BULK_THRESHOLD = 25;

const PERSON_FIELD_LABELS: Record<string, string> = {
  name: 'nom',
  givenName: 'nom',
  surname: 'nom',
  sex: 'sexe',
  birth: 'naissance',
  baptism: 'baptême',
  death: 'décès',
  burial: 'sépulture',
  occupations: 'profession',
  residences: 'résidence',
  notes: 'notes',
  citations: 'sources',
  media: 'médias',
  familiesAsSpouse: 'union',
  familiesAsChild: 'parents',
};

// Champs techniques (dont createdBy ajouté par Firestore) : leur variation n'est pas une modification
const ARCHIVE_IGNORED_FIELDS = new Set(['photoTags', 'updatedAt', 'createdAt', 'createdBy']);

/** Sérialisation à clés triées : Firestore ne conserve pas l'ordre des clés, une simple relecture ne doit pas créer d'alerte */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function changedFields<T extends object>(prev: T, next: T, labels: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const fields = new Set<string>();
  for (const key of keys) {
    const label = labels[key];
    if (!label) continue;
    if (stableStringify((prev as any)[key]) !== stableStringify((next as any)[key])) fields.add(label);
  }
  return Array.from(fields);
}

function newId(): string {
  return 'chg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/**
 * Compare deux états de l'arbre et retourne les événements correspondants (vide si rien n'a changé).
 */
export function diffTreeStates(prev: TreeState, next: TreeState, at = Date.now()): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  const push = (e: Omit<ChangeEvent, 'id' | 'at'>) => events.push({ id: newId(), at, ...e });
  const prevPeople = prev.data.individuals;
  const nextPeople = next.data.individuals;

  // Fiches ajoutées, modifiées, supprimées
  for (const [id, person] of Object.entries(nextPeople)) {
    const before = prevPeople[id];
    if (!before) {
      push({ kind: 'person:add', targetType: 'person', targetId: id, name: person.name });
    } else if (stableStringify(before) !== stableStringify(person)) {
      const fields = changedFields<Individual>(before, person, PERSON_FIELD_LABELS);
      if (fields.length > 0) {
        push({ kind: 'person:edit', targetType: 'person', targetId: id, name: person.name, fields });
      }
    }
  }
  for (const [id, person] of Object.entries(prevPeople)) {
    if (!nextPeople[id]) push({ kind: 'person:delete', targetType: 'person', targetId: id, name: person.name });
  }

  // Unions : seuls les changements propres à la famille (mariage, divorce, notes) ;
  // les liens parents/enfants/conjoints apparaissent déjà dans les fiches concernées.
  for (const [id, fam] of Object.entries(next.data.families)) {
    const before = prev.data.families[id];
    if (!before) continue;
    const fields = changedFields(before, fam, { marriage: 'mariage', divorce: 'divorce', notes: 'notes de l\'union' });
    const targetId = fam.husbandId || fam.wifeId;
    if (fields.length > 0 && targetId && nextPeople[targetId]) {
      const names = [fam.husbandId, fam.wifeId].map(p => p && nextPeople[p]?.name).filter(Boolean).join(' & ');
      push({ kind: 'family:edit', targetType: 'person', targetId, name: names, fields });
    }
  }

  // Archives et repérages photo
  const prevArchives = new Map(prev.archives.map(a => [a.id, a]));
  const nextArchiveIds = new Set(next.archives.map(a => a.id));
  for (const doc of next.archives) {
    const before = prevArchives.get(doc.id);
    if (!before) {
      push({ kind: 'archive:add', targetType: 'archive', targetId: doc.id, name: doc.title });
    } else {
      const strip = (a: ArchiveDocument) => Object.fromEntries(Object.entries(a).filter(([k]) => !ARCHIVE_IGNORED_FIELDS.has(k)));
      if (stableStringify(strip(before)) !== stableStringify(strip(doc))) {
        push({ kind: 'archive:edit', targetType: 'archive', targetId: doc.id, name: doc.title });
      }
    }
    const taggedBefore = new Set((before?.photoTags || []).map(t => t.personId));
    for (const tag of doc.photoTags || []) {
      if (taggedBefore.has(tag.personId)) continue;
      taggedBefore.add(tag.personId);
      push({
        kind: 'photo:tag', targetType: 'archive', targetId: doc.id, name: doc.title,
        personId: tag.personId, personName: nextPeople[tag.personId]?.name,
      });
    }
  }
  for (const doc of prev.archives) {
    if (!nextArchiveIds.has(doc.id)) push({ kind: 'archive:delete', targetType: 'archive', targetId: doc.id, name: doc.title });
  }

  if (events.length <= BULK_THRESHOLD) return events;

  // Import GEDCOM, restauration… : une alerte de synthèse plutôt que des centaines
  const count = (pred: (e: ChangeEvent) => boolean) => events.filter(pred).length;
  const rootId = next.data.rootPersonId && nextPeople[next.data.rootPersonId]
    ? next.data.rootPersonId
    : Object.keys(nextPeople)[0];
  if (!rootId) return [];
  return [{
    id: newId(), at, kind: 'bulk', targetType: 'person', targetId: rootId,
    counts: {
      added: count(e => e.kind === 'person:add'),
      edited: count(e => e.kind === 'person:edit' || e.kind === 'family:edit'),
      deleted: count(e => e.kind === 'person:delete'),
    },
  }];
}

/** Ajoute des événements au journal (les plus récents en tête), borné à MAX_CHANGE_LOG */
export function appendChanges(log: ChangeEvent[], events: ChangeEvent[]): ChangeEvent[] {
  if (events.length === 0) return log;
  return [...events.slice().reverse(), ...log].slice(0, MAX_CHANGE_LOG);
}

/**
 * Restreint le journal à ce qu'un lien de partage peut montrer : fiches et archives de la branche partagée,
 * noms tels qu'ils apparaissent dans l'instantané (donc anonymisés si les vivants sont masqués).
 */
export function filterChangesForShare(
  log: ChangeEvent[],
  sharedTree: GenealogyData,
  sharedArchives: ArchiveDocument[],
  hideLiving: boolean
): ChangeEvent[] {
  const people = sharedTree.individuals;
  const archives = new Map(sharedArchives.map(a => [a.id, a]));
  const out: ChangeEvent[] = [];
  for (const e of log) {
    if (e.kind === 'person:delete' || e.kind === 'archive:delete') {
      // L'élément n'existe plus : impossible de savoir s'il était protégé
      out.push({ ...e, name: hideLiving ? undefined : e.name });
    } else if (e.kind === 'bulk') {
      out.push({ ...e, targetId: people[e.targetId] ? e.targetId : (sharedTree.rootPersonId || Object.keys(people)[0] || e.targetId) });
    } else if (e.targetType === 'person') {
      if (people[e.targetId]) out.push({ ...e, name: e.kind === 'family:edit' ? undefined : people[e.targetId].name });
    } else {
      const doc = archives.get(e.targetId);
      if (!doc) continue;
      if (e.kind === 'photo:tag') {
        if (e.personId && people[e.personId]) out.push({ ...e, name: doc.title, personName: people[e.personId].name });
      } else {
        out.push({ ...e, name: doc.title });
      }
    }
  }
  return out;
}

/** Texte d'une alerte, avec les noms actuels quand l'élément existe encore */
export function describeChange(e: ChangeEvent, data?: GenealogyData): string {
  const personName = (id: string, fallback?: string) => data?.individuals[id]?.name || fallback || 'Une fiche';
  const fields = e.fields && e.fields.length > 0 ? ` (${e.fields.join(', ')})` : '';
  switch (e.kind) {
    case 'person:add':
      return `Nouvelle fiche : ${personName(e.targetId, e.name)}`;
    case 'person:edit':
      return `Fiche modifiée : ${personName(e.targetId, e.name)}${fields}`;
    case 'person:delete':
      return e.name ? `Fiche supprimée : ${e.name}` : 'Une fiche a été supprimée';
    case 'family:edit':
      return `Union modifiée : ${e.name || personName(e.targetId)}${fields}`;
    case 'archive:add':
      return `Nouvelle archive : ${e.name || 'document'}`;
    case 'archive:edit':
      return `Archive modifiée : ${e.name || 'document'}`;
    case 'archive:delete':
      return e.name ? `Archive supprimée : ${e.name}` : 'Une archive a été supprimée';
    case 'photo:tag':
      return `${personName(e.personId || '', e.personName)} identifié(e) sur la photo « ${e.name || 'sans titre'} »`;
    case 'bulk': {
      const c = e.counts || { added: 0, edited: 0, deleted: 0 };
      const parts = [
        c.added && `${c.added} fiche(s) ajoutée(s)`,
        c.edited && `${c.edited} modifiée(s)`,
        c.deleted && `${c.deleted} supprimée(s)`,
      ].filter(Boolean);
      return `Mise à jour importante de l'arbre : ${parts.join(', ') || 'contenu remplacé'}`;
    }
  }
}

/** L'élément visé existe-t-il encore (pour proposer d'y aller) ? */
export function isChangeNavigable(e: ChangeEvent, data: GenealogyData, archives: ArchiveDocument[]): boolean {
  if (e.kind === 'person:delete' || e.kind === 'archive:delete') return false;
  return e.targetType === 'person'
    ? Boolean(data.individuals[e.targetId])
    : archives.some(a => a.id === e.targetId);
}

/** Alertes déjà vues, par arbre (créateur) ou par lien de partage (destinataire) */
export interface AlertReadState {
  lastSeenAt: number;
  readIds: string[];
}

const alertKey = (scope: string) => `genealogor_alerts_${scope}`;

export function loadAlertState(scope: string): AlertReadState | null {
  try {
    const raw = localStorage.getItem(alertKey(scope));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveAlertState(scope: string, state: AlertReadState): void {
  try {
    localStorage.setItem(alertKey(scope), JSON.stringify(state));
  } catch (e) {}
}

/** Alertes non lues : postérieures au dernier « tout lu » et non ouvertes individuellement */
export function getUnreadChanges(log: ChangeEvent[], state: AlertReadState | null): ChangeEvent[] {
  if (!state) return [];
  const read = new Set(state.readIds);
  return log.filter(e => e.at > state.lastSeenAt && !read.has(e.id));
}

/** État « tout est lu » à la date de l'événement le plus récent */
export function allReadState(log: ChangeEvent[], previous: AlertReadState | null): AlertReadState {
  const latest = log.reduce((max, e) => Math.max(max, e.at), previous?.lastSeenAt || 0);
  return { lastSeenAt: latest, readIds: [] };
}
