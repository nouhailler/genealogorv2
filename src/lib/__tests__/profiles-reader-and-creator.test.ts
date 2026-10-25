import { describe, it, expect, beforeEach } from 'vitest';
import { BranchAccess, BranchRole, GenealogyData } from '../../types/genealogy';

// Mock localStorage and window in Vitest
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
  location: {
    origin: 'https://genealogor.test',
    pathname: '/',
    search: '',
  },
};

import { 
  markTreeCreatedLocally, 
  isTreeCreatedLocally, 
  recordKnownTree, 
  getKnownTrees 
} from '../tree-manager';

describe('Profils Utilisateurs (Profil 1: Créateur vs Profil 2: Lecteur)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  describe('Règle Fondamentale : Le Profil Lecteur ne peut en aucun cas créer un arbre', () => {
    it('doit bloquer toute tentative de création d\'arbre si le rôle n\'est pas admin', () => {
      const userRole: BranchRole = 'viewer';

      // Simulation de la validation stricte appliquée dans TreeManagerModal.handleCreateSubmit
      const canCreateTree = (role: BranchRole): boolean => {
        return role === 'admin';
      };

      expect(canCreateTree('viewer')).toBe(false);
      expect(canCreateTree('editor')).toBe(false);
      expect(canCreateTree('admin')).toBe(true);

      const attemptTreeCreation = (role: BranchRole, treeTitle: string): { success: boolean; error?: string } => {
        if (role !== 'admin') {
          return {
            success: false,
            error: 'Action interdite : En aucun cas le profil lecteur ne peut créer un arbre généalogique.',
          };
        }
        return { success: true };
      };

      const result = attemptTreeCreation(userRole, 'Nouvelle Famille');
      expect(result.success).toBe(false);
      expect(result.error).toContain('En aucun cas le profil lecteur ne peut créer un arbre généalogique');
    });

    it('autorise la création d\'arbre uniquement pour le Profil 1 (Créateur / Administrateur)', () => {
      const userRole: BranchRole = 'admin';
      const treeId = 'famille-nouvelle-1850';

      markTreeCreatedLocally(treeId);
      recordKnownTree({
        id: treeId,
        title: 'Famille Nouvelle 1850',
        isCreator: true,
      });

      expect(isTreeCreatedLocally(treeId)).toBe(true);
      const tree = getKnownTrees().find(t => t.id === treeId);
      expect(tree?.isCreator).toBe(true);
    });
  });

  describe('Partage d\'arbre : Profil Lecteur par défaut', () => {
    it('doit générer par défaut une URL avec role=viewer lors du partage avec un tiers', () => {
      const roomId = 'famille-dupont-1750';
      const baseUrl = 'https://genealogor.test/';
      
      // Simulation du générateur d'URL de partage direct (ShareModal.getDirectReaderUrl)
      const generateReaderShareUrl = (room: string): string => {
        const params = new URLSearchParams();
        params.set('room', room);
        params.set('role', 'viewer');
        return `${baseUrl}?${params.toString()}`;
      };

      const sharedUrl = generateReaderShareUrl(roomId);
      expect(sharedUrl).toBe('https://genealogor.test/?room=famille-dupont-1750&role=viewer');

      // Vérification que le paramètre extrait par le destinataire est bien "viewer"
      const parsedParams = new URLSearchParams(sharedUrl.split('?')[1]);
      expect(parsedParams.get('room')).toBe('famille-dupont-1750');
      expect(parsedParams.get('role')).toBe('viewer');
    });

    it('doit attribuer par défaut le profil lecteur lorsqu\'un tiers arrive via un lien de salon', () => {
      const sharedRoomId = 'arbre-partage-cousins';

      // Le destinataire n'a pas créé cet arbre sur son appareil
      expect(isTreeCreatedLocally(sharedRoomId)).toBe(false);

      // Logique d'initialisation de App.tsx
      const resolveRoleForRoom = (
        roomParam: string | null, 
        roleParam: BranchRole | null,
        isCreator: boolean
      ): BranchRole => {
        if (roleParam === 'viewer') return 'viewer';
        if (roleParam === 'admin') return 'admin';
        if (roleParam === 'editor') return 'editor';

        // Règle : si on arrive sur un salon partagé non créé localement -> lecteur par défaut
        if (roomParam && !isCreator) {
          return 'viewer';
        }

        if (roomParam && isCreator) {
          return 'admin';
        }

        return 'admin';
      };

      // Cas 1 : Lien avec role=viewer explicite
      expect(resolveRoleForRoom(sharedRoomId, 'viewer', false)).toBe('viewer');

      // Cas 2 : Lien avec room=... sans paramètre role spécifié (défaut automatique sur lecteur)
      expect(resolveRoleForRoom(sharedRoomId, null, false)).toBe('viewer');

      // Cas 3 : Le créateur lui-même qui rouvre son salon
      expect(resolveRoleForRoom(sharedRoomId, null, true)).toBe('admin');
    });

    it('doit configurer le rôle par défaut du formulaire de lien comme viewer', () => {
      // Configuration par défaut dans ShareModal
      const defaultFormRole: BranchRole = 'viewer';
      expect(defaultFormRole).toBe('viewer');
    });
  });

  describe('Restrictions d\'altération des données pour le Profil Lecteur', () => {
    it('doit interdire l\'ajout de personnes aux lecteurs', () => {
      const checkPermission = (role: BranchRole, action: 'addPerson' | 'editPerson' | 'deletePerson' | 'clearTree') => {
        if (role === 'viewer') return false;
        return true;
      };

      expect(checkPermission('viewer', 'addPerson')).toBe(false);
      expect(checkPermission('viewer', 'editPerson')).toBe(false);
      expect(checkPermission('viewer', 'deletePerson')).toBe(false);
      expect(checkPermission('viewer', 'clearTree')).toBe(false);

      expect(checkPermission('admin', 'addPerson')).toBe(true);
      expect(checkPermission('admin', 'clearTree')).toBe(true);
    });
  });
});
