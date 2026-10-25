import { describe, it, expect, beforeEach } from 'vitest';

// Mock localStorage and window in Node/Vitest environment
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
  key: (i: number) => Object.keys(mockStorage)[i] || null,
  length: 0,
} as any;

(global as any).localStorage = mockLocalStorage;
(global as any).window = {
  localStorage: mockLocalStorage,
};

import { 
  slugifyTreeId, 
  isValidTreeId, 
  getKnownTrees, 
  saveKnownTrees, 
  recordKnownTree, 
  removeKnownTreeFromLocal,
  getStoredCurrentRoom,
  setStoredCurrentRoom,
  DEFAULT_TREE_ID,
  markTreeCreatedLocally,
  isTreeCreatedLocally,
  getCreatedTreeIds
} from '../tree-manager';

describe('Gestionnaire Multi-Arbres (TreeManager)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  describe('slugifyTreeId', () => {
    it('doit normaliser les accents et caractères spéciaux en identifiant valide', () => {
      expect(slugifyTreeId('Famille Éléonore de Kerguélen')).toBe('famille-eleonore-de-kerguelen');
      expect(slugifyTreeId('Arbre Bernard & Associés - 1850!')).toBe('arbre-bernard-associes-1850');
      expect(slugifyTreeId('   L\'Hôpital-Camfrout 1789   ')).toBe('l-hopital-camfrout-1789');
    });

    it('doit retourner un slug par défaut si la chaîne ne contient aucun caractère valide', () => {
      expect(slugifyTreeId('   ***   ')).toBe('mon-arbre');
      expect(slugifyTreeId('')).toBe('mon-arbre');
    });
  });

  describe('isValidTreeId', () => {
    it('doit valider les identifiants conformes aux contraintes Firestore et WebSocket', () => {
      expect(isValidTreeId('famille-martin-1742')).toBe(true);
      expect(isValidTreeId('arbre_dupont_1850')).toBe(true);
      expect(isValidTreeId('lignee123')).toBe(true);
      expect(isValidTreeId('famille-bernard')).toBe(true);
    });

    it('doit rejeter les identifiants trop courts, trop longs ou avec caractères interdits', () => {
      expect(isValidTreeId('ab')).toBe(false); // Trop court (< 3)
      expect(isValidTreeId('')).toBe(false);
      expect(isValidTreeId('arbre with spaces')).toBe(false);
      expect(isValidTreeId('famille/dupont')).toBe(false);
      expect(isValidTreeId('arbre?room=123')).toBe(false);
      expect(isValidTreeId('a'.repeat(65))).toBe(false); // Trop long (> 64)
    });
  });

  describe('Persistance et historique des arbres connus (KnownTrees)', () => {
    it('doit retourner une liste vide au démarrage sans injection d’arbre démo', () => {
      const trees = getKnownTrees();
      expect(trees).toEqual([]);
    });

    it('doit enregistrer un nouvel arbre et le placer en tête de liste', () => {
      recordKnownTree({
        id: 'famille-bernard-1830',
        title: 'Famille Bernard d\'Auvergne',
        personCount: 42,
      });

      const updated = getKnownTrees();
      expect(updated.length).toBe(1);
      expect(updated[0].id).toBe('famille-bernard-1830');
      expect(updated[0].title).toBe('Famille Bernard d\'Auvergne');
      expect(updated[0].personCount).toBe(42);
    });

    it('doit mettre à jour un arbre existant sans créer de doublon', () => {
      recordKnownTree({
        id: 'famille-bernard-1830',
        title: 'Famille Bernard',
        personCount: 10,
      });

      recordKnownTree({
        id: 'famille-bernard-1830',
        title: 'Famille Bernard (Mise à jour)',
        personCount: 15,
      });

      const trees = getKnownTrees();
      const bernardTrees = trees.filter(t => t.id === 'famille-bernard-1830');
      expect(bernardTrees.length).toBe(1);
      expect(bernardTrees[0].title).toBe('Famille Bernard (Mise à jour)');
      expect(bernardTrees[0].personCount).toBe(15);
    });

    it('doit supprimer un arbre de l\'historique local sans contrainte', () => {
      recordKnownTree({
        id: 'famille-temporaire',
        title: 'Arbre temporaire',
      });

      expect(getKnownTrees().some(t => t.id === 'famille-temporaire')).toBe(true);

      const afterDelete = removeKnownTreeFromLocal('famille-temporaire');
      expect(afterDelete.some(t => t.id === 'famille-temporaire')).toBe(false);
    });
  });

  describe('Gestion du salon actif (StoredCurrentRoom)', () => {
    it('doit retourner le salon par défaut (mon-arbre) si rien n\'est stocké', () => {
      expect(getStoredCurrentRoom()).toBe(DEFAULT_TREE_ID);
    });

    it('doit mémoriser et restituer le salon actif sélectionné', () => {
      setStoredCurrentRoom('arbre-breton-2024');
      expect(getStoredCurrentRoom()).toBe('arbre-breton-2024');
    });
  });

  describe('Distinction Profil Créateur vs Profil Lecteur (markTreeCreatedLocally)', () => {
    it('doit marquer un arbre comme créé par cet utilisateur', () => {
      expect(isTreeCreatedLocally('famille-durand-1820')).toBe(false);
      markTreeCreatedLocally('famille-durand-1820');
      expect(isTreeCreatedLocally('famille-durand-1820')).toBe(true);
      expect(getCreatedTreeIds()).toContain('famille-durand-1820');
    });

    it('doit considérer un arbre partagé reçu par lien comme non créé (profil lecteur)', () => {
      // Un utilisateur tiers reçoit un lien vers l'arbre d'un proche
      const sharedRoomId = 'arbre-partage-cousins';
      expect(isTreeCreatedLocally(sharedRoomId)).toBe(false);
    });

    it('doit renseigner isCreator dans les KnownTrees lors de l\'enregistrement', () => {
      markTreeCreatedLocally('arbre-personnel');
      recordKnownTree({
        id: 'arbre-personnel',
        title: 'Mon Arbre Personnel',
      });

      const trees = getKnownTrees();
      const myTree = trees.find(t => t.id === 'arbre-personnel');
      expect(myTree?.isCreator).toBe(true);
    });
  });
});
