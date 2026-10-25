import { describe, it, expect, beforeEach } from 'vitest';

// localStorage minimal mais complet (length / key) pour le balayage des sauvegardes de corruption
const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, val: string) => { store.set(key, String(val)); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
} as any;

(global as any).localStorage = mockLocalStorage;
(global as any).window = { localStorage: mockLocalStorage };

import {
  deleteTreeCompletely,
  getTreeStorageKeys,
  isFirstAppUse,
  markFirstTreeCreated,
  markTreeCreatedLocally,
  recordKnownTree,
  getKnownTrees,
  getCreatedTreeIds,
  isTreeCreatedLocally,
  getStoredCurrentRoom,
  setStoredCurrentRoom,
  DEFAULT_TREE_ID,
} from '../tree-manager';
import { STORAGE_KEYS } from '../storage-manager';

function createTree(id: string, title: string) {
  markTreeCreatedLocally(id);
  markFirstTreeCreated();
  recordKnownTree({ id, title, personCount: 3, isCreator: true });
  localStorage.setItem(`${STORAGE_KEYS.TREE}_${id}`, '{"data":{}}');
  localStorage.setItem(`${STORAGE_KEYS.ARCHIVES}_${id}`, '{"data":[]}');
  localStorage.setItem(`${STORAGE_KEYS.ACCESS}_${id}`, '{"data":[]}');
  localStorage.setItem(`${STORAGE_KEYS.TREE}_${id}_corrupt_backup_123`, 'x');
}

describe('Premier lancement et suppression d\'arbre', () => {
  beforeEach(() => {
    store.clear();
  });

  it('détecte la première utilisation tant qu\'aucun arbre n\'a été créé', () => {
    expect(isFirstAppUse()).toBe(true);
    createTree('famille-coste', 'Famille Coste');
    expect(isFirstAppUse()).toBe(false);
  });

  it('les clés de stockage ciblent la partition v2 de l\'arbre', () => {
    const keys = getTreeStorageKeys('famille-coste');
    expect(keys).toContain('genealogor_tree_v2_famille-coste');
    expect(keys).toContain('genealogor_archives_v2_famille-coste');
    expect(keys).toContain('genealogor_access_v2_famille-coste');
  });

  it('efface toutes les données locales de l\'arbre supprimé sans toucher aux autres', async () => {
    createTree('famille-coste', 'Famille Coste');
    createTree('famille-palem', 'Famille Palem');

    const res = await deleteTreeCompletely('famille-coste', null);

    expect(res.success).toBe(true);
    expect(res.nextTreeId).toBe('famille-palem');
    for (const key of getTreeStorageKeys('famille-coste')) {
      expect(localStorage.getItem(key)).toBeNull();
    }
    expect(localStorage.getItem(`${STORAGE_KEYS.TREE}_famille-coste_corrupt_backup_123`)).toBeNull();
    expect(isTreeCreatedLocally('famille-coste')).toBe(false);
    expect(getCreatedTreeIds()).toEqual(['famille-palem']);
    expect(getKnownTrees().map(t => t.id)).toEqual(['famille-palem']);

    // L'autre arbre est intact et devient l'arbre courant
    expect(localStorage.getItem(`${STORAGE_KEYS.TREE}_famille-palem`)).not.toBeNull();
    expect(getStoredCurrentRoom()).toBe('famille-palem');
  });

  it('revient à l\'état « première utilisation » après suppression du dernier arbre', async () => {
    createTree('famille-coste', 'Famille Coste');
    setStoredCurrentRoom('famille-coste');
    localStorage.setItem(STORAGE_KEYS.TREE, '{"data":{}}');

    const res = await deleteTreeCompletely('famille-coste', null);

    expect(res.success).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.TREE)).toBeNull();
    expect(res.nextTreeId).toBeUndefined();
    expect(getStoredCurrentRoom()).toBe(DEFAULT_TREE_ID);
    expect(isFirstAppUse()).toBe(true);
  });
});
