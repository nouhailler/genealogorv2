import { GenealogyData, ArchiveDocument, BranchAccess } from '../types/genealogy';

export const STORAGE_VERSION = '2.0.0';

export interface StorageContainer<T> {
  version: string;
  updatedAt: number;
  revision: number;
  data: T;
}

export type SyncState = 'synced' | 'pending' | 'syncing' | 'offline' | 'conflict' | 'error';
export type PendingStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export interface PendingChange {
  id: string;
  action: 'tree:update' | 'person:edit' | 'archive:add' | 'archive:delete' | 'access:update';
  payload: any;
  timestamp: number;
  retryCount: number;
  status: PendingStatus;
  lastAttempt?: number;
  error?: string;
}

export const STORAGE_KEYS = {
  TREE: 'genealogor_tree_v2',
  ARCHIVES: 'genealogor_archives_v2',
  ACCESS: 'genealogor_access_v2',
  PENDING: 'genealogor_pending_v2',
  PRE_RESTORE_BACKUP: 'genealogor_pre_restore_backup',
};

/**
 * Sauvegarde de manière sécurisée et versionnée dans localStorage.
 */
export function setVersionedItem<T>(key: string, data: T, revision = 1): void {
  try {
    const container: StorageContainer<T> = {
      version: STORAGE_VERSION,
      updatedAt: Date.now(),
      revision,
      data,
    };
    localStorage.setItem(key, JSON.stringify(container));
  } catch (error) {
    console.error(`Erreur d'écriture localStorage pour la clé ${key}:`, error);
  }
}

/**
 * Charge un élément versionné en vérifiant l'intégrité et en protégeant contre la corruption.
 * Si les données sont corrompues, elles sont préservées dans une clé de secours (_corrupt_backup)
 * et une erreur récupérable est levée sans écraser silencieusement.
 */
export function getVersionedItem<T>(key: string, fallback: T): { data: T; revision: number; isCorrupted: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return { data: fallback, revision: 1, isCorrupted: false };
    }

    const parsed = JSON.parse(raw);
    // Format conteneur versionné v2
    if (parsed && typeof parsed === 'object' && 'version' in parsed && 'data' in parsed) {
      return {
        data: parsed.data as T,
        revision: parsed.revision || 1,
        isCorrupted: false,
      };
    }

    // Format hérité non conteneurisé (v1)
    return { data: parsed as T, revision: 1, isCorrupted: false };
  } catch (err) {
    console.error(`Données corrompues détectées pour la clé ${key}. Sauvegarde d'urgence.`);
    try {
      const corruptRaw = localStorage.getItem(key);
      if (corruptRaw) {
        localStorage.setItem(`${key}_corrupt_backup_${Date.now()}`, corruptRaw);
      }
    } catch (backupErr) {}

    return { data: fallback, revision: 1, isCorrupted: true };
  }
}

/**
 * Gestion de la file d'attente des modifications hors ligne.
 */
export function getPendingChanges(): PendingChange[] {
  return getVersionedItem<PendingChange[]>(STORAGE_KEYS.PENDING, []).data;
}

export function addPendingChange(
  action: PendingChange['action'], 
  payload: any, 
  customId?: string
): PendingChange {
  const pending = getPendingChanges();
  const change: PendingChange = {
    id: customId || ('chg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)),
    action,
    payload,
    timestamp: Date.now(),
    retryCount: 0,
    status: 'pending',
  };
  pending.push(change);
  setVersionedItem(STORAGE_KEYS.PENDING, pending);
  return change;
}

export function updatePendingChange(id: string, updates: Partial<PendingChange>): void {
  const pending = getPendingChanges();
  const idx = pending.findIndex(c => c.id === id);
  if (idx !== -1) {
    pending[idx] = { ...pending[idx], ...updates };
    setVersionedItem(STORAGE_KEYS.PENDING, pending);
  }
}

export function markPendingChangeFailed(id: string, error?: string): void {
  const pending = getPendingChanges();
  const idx = pending.findIndex(c => c.id === id);
  if (idx !== -1) {
    const current = pending[idx];
    const newRetryCount = (current.retryCount || 0) + 1;
    pending[idx] = {
      ...current,
      retryCount: newRetryCount,
      status: newRetryCount >= 3 ? 'conflict' : 'failed',
      lastAttempt: Date.now(),
      error: error || current.error,
    };
    setVersionedItem(STORAGE_KEYS.PENDING, pending);
  }
}

export function clearPendingChanges(): void {
  setVersionedItem(STORAGE_KEYS.PENDING, []);
}

export function removePendingChange(id: string): void {
  const pending = getPendingChanges().filter(c => c.id !== id);
  setVersionedItem(STORAGE_KEYS.PENDING, pending);
}
