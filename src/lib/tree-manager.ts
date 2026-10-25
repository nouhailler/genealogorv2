/**
 * Gestionnaire des arbres généalogiques : persistance locale des arbres connus,
 * génération d'identifiants (slugs) et utilitaires multi-arbres.
 */

import { STORAGE_KEYS } from './storage-manager';

export interface KnownTree {
  id: string;
  title: string;
  description?: string;
  lastOpenedAt: number;
  personCount?: number;
  isSample?: boolean;
  ownerEmail?: string;
  isCreator?: boolean;
}

const STORAGE_KEY_KNOWN_TREES = 'genealogor_known_trees';
const STORAGE_KEY_CURRENT_ROOM = 'genealogor_current_room';
const STORAGE_KEY_CREATED_TREES = 'genealogor_created_trees';

export const DEFAULT_TREE_ID = 'mon-arbre';

/**
 * Enregistre qu'un arbre a été créé localement par cet utilisateur (Profil Créateur/Admin)
 */
export function markTreeCreatedLocally(treeId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const list = getCreatedTreeIds();
    if (!list.includes(treeId)) {
      list.push(treeId);
      localStorage.setItem(STORAGE_KEY_CREATED_TREES, JSON.stringify(list));
    }
    localStorage.setItem(`genealogor_created_${treeId}`, 'true');
  } catch (e) {}
}

/**
 * Récupère les identifiants des arbres créés localement par l'utilisateur
 */
export function getCreatedTreeIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CREATED_TREES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Vérifie si un arbre a été créé par l'utilisateur sur cet appareil
 */
export function isTreeCreatedLocally(treeId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(`genealogor_created_${treeId}`) === 'true') return true;
    return getCreatedTreeIds().includes(treeId);
  } catch (e) {
    return false;
  }
}

/**
 * Nettoie une chaîne pour en faire un identifiant de salle/arbre valide
 * Conforme aux règles Firestore et WebSocket (^[a-zA-Z0-9_\-]+$)
 */
export function slugifyTreeId(input: string): string {
  const normalized = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // Remplace caractères spéciaux par -
    .replace(/^-+|-+$/g, ''); // Supprime les tirets début/fin

  return normalized || 'mon-arbre';
}

/**
 * Valide si un identifiant d'arbre respecte le format strict
 */
export function isValidTreeId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length < 3 || id.length > 64) return false;
  return /^[a-zA-Z0-9_\-]+$/.test(id);
}

/**
 * Récupère la liste des arbres connus enregistrés localement
 */
export function getKnownTrees(): KnownTree[] {
  if (typeof window === 'undefined') return [];
  
  try {
    const raw = localStorage.getItem(STORAGE_KEY_KNOWN_TREES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Enregistre la liste des arbres connus
 */
export function saveKnownTrees(trees: KnownTree[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_KNOWN_TREES, JSON.stringify(trees));
  } catch (e) {}
}

/**
 * Enregistre ou actualise un arbre dans la liste des arbres connus
 */
export function recordKnownTree(tree: Omit<KnownTree, 'lastOpenedAt'> & { lastOpenedAt?: number }): KnownTree[] {
  const current = getKnownTrees();
  const existingIdx = current.findIndex(t => t.id === tree.id);
  
  const updatedEntry: KnownTree = {
    ...tree,
    isCreator: tree.isCreator !== undefined ? tree.isCreator : isTreeCreatedLocally(tree.id),
    lastOpenedAt: tree.lastOpenedAt || Date.now(),
  };

  let next: KnownTree[];
  if (existingIdx >= 0) {
    const existing = current[existingIdx];
    next = [...current];
    next[existingIdx] = {
      ...existing,
      ...updatedEntry,
      isCreator: updatedEntry.isCreator ?? existing.isCreator ?? isTreeCreatedLocally(tree.id),
      lastOpenedAt: Date.now(),
    };
  } else {
    next = [updatedEntry, ...current];
  }

  // Trier par date de dernière ouverture décroissante
  next.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
  saveKnownTrees(next);
  return next;
}

export const STORAGE_KEY_FIRST_TREE_CREATED = 'genealogor_first_tree_created';

/**
 * Détermine s'il s'agit de la toute première utilisation de l'application
 * (aucun arbre personnalisé n'a encore été créé par l'utilisateur).
 */
export function isFirstAppUse(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const hasFlag = localStorage.getItem(STORAGE_KEY_FIRST_TREE_CREATED) === 'true';
    if (hasFlag) return false;
    const createdTrees = getCreatedTreeIds();
    const knownTrees = getKnownTrees();
    return createdTrees.length === 0 && knownTrees.length === 0;
  } catch (e) {
    return false;
  }
}

/**
 * Enregistre que le premier arbre a été créé
 */
export function markFirstTreeCreated(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_FIRST_TREE_CREATED, 'true');
  } catch (e) {}
}

/**
 * Supprime un arbre de l'historique local (sans toucher aux données Firestore distantes)
 */
export function removeKnownTreeFromLocal(treeId: string): KnownTree[] {
  const current = getKnownTrees();
  const filtered = current.filter(t => t.id !== treeId);
  saveKnownTrees(filtered);
  return filtered;
}

/**
 * Clés localStorage propres à un arbre (partitionnées par salon).
 */
export function getTreeStorageKeys(treeId: string): string[] {
  return [
    `${STORAGE_KEYS.TREE}_${treeId}`,
    `${STORAGE_KEYS.ARCHIVES}_${treeId}`,
    `${STORAGE_KEYS.ACCESS}_${treeId}`,
    `genealogor_created_${treeId}`,
    `genealogor_changes_v1_${treeId}`,
    `genealogor_alerts_${treeId}`,
    // Anciennes clés (versions antérieures à la partition v2)
    `genealogor_tree_${treeId}`,
    `genealogor_archives_${treeId}`,
    `genealogor_pending_changes_${treeId}`,
    `genealogor_tree_backup_${treeId}`,
  ];
}

/**
 * Remet l'application dans l'état « première utilisation » quand plus aucun arbre n'existe,
 * afin que l'assistant de création d'arbre soit proposé de nouveau.
 */
export function resetFirstTreeFlag(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_FIRST_TREE_CREATED);
  } catch (e) {}
}

/**
 * Supprime complètement un arbre :
 * - Efface les données locales de l'arbre (individus, familles)
 * - Efface les archives locales de l'arbre
 * - Supprime les modifications en attente de synchronisation
 * - Retire l'arbre des listes locales (arbres connus et arbres créés)
 * - Si un utilisateur Firebase est connecté, supprime le document distant Firestore
 */
export async function deleteTreeCompletely(
  treeId: string, 
  currentUser?: { uid: string; email?: string | null } | null
): Promise<{ success: boolean; nextTreeId?: string }> {
  if (typeof window === 'undefined') return { success: false };

  try {
    // 1. Nettoyer les clés de stockage locales dédiées à cet arbre
    //    (+ copies globales non partitionnées si c'est l'arbre actif)
    const isCurrentTree = localStorage.getItem(STORAGE_KEY_CURRENT_ROOM) === treeId;
    const globalMirrors = isCurrentTree ? [STORAGE_KEYS.TREE, STORAGE_KEYS.ARCHIVES, STORAGE_KEYS.ACCESS] : [];
    for (const key of [...getTreeStorageKeys(treeId), ...globalMirrors]) {
      try {
        localStorage.removeItem(key);
      } catch (e) {}
    }
    // Sauvegardes de corruption éventuelles (`<clé>_corrupt_backup_<horodatage>`)
    try {
      const prefixes = getTreeStorageKeys(treeId).map(k => `${k}_corrupt_backup_`);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && prefixes.some(p => key.startsWith(p))) localStorage.removeItem(key);
      }
    } catch (e) {}

    // 2. Retirer des arbres créés
    try {
      const createdList = getCreatedTreeIds().filter(id => id !== treeId);
      localStorage.setItem(STORAGE_KEY_CREATED_TREES, JSON.stringify(createdList));
    } catch (e) {}

    // 3. Retirer des arbres connus
    const remainingKnown = removeKnownTreeFromLocal(treeId);

    // 4. Si connecté à Firestore, supprimer le document distant
    if (currentUser) {
      try {
        const { deleteTreeFromFirestore } = await import('./firestore-sync');
        await deleteTreeFromFirestore(treeId, currentUser as any);
      } catch (e) {
        console.warn('Erreur lors de la suppression distante Firestore :', e);
      }
    }

    // Déterminer le prochain arbre sur lequel basculer
    const nextTreeId = remainingKnown.length > 0 ? remainingKnown[0].id : undefined;
    if (nextTreeId) {
      setStoredCurrentRoom(nextTreeId);
    } else {
      localStorage.removeItem(STORAGE_KEY_CURRENT_ROOM);
      resetFirstTreeFlag();
    }

    return { success: true, nextTreeId };
  } catch (err) {
    console.error('Erreur lors de la suppression complète de l\'arbre :', err);
    return { success: false };
  }
}

/**
 * Récupère le dernier identifiant d'arbre utilisé
 */
export function getStoredCurrentRoom(): string {
  if (typeof window === 'undefined') return DEFAULT_TREE_ID;
  return localStorage.getItem(STORAGE_KEY_CURRENT_ROOM) || DEFAULT_TREE_ID;
}

/**
 * Enregistre l'arbre courant
 */
export function setStoredCurrentRoom(roomId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_CURRENT_ROOM, roomId);
  } catch (e) {}
}

