import { describe, it, expect } from 'vitest';

/**
 * Modélisation formelle et validation unitaire des règles de sécurité Firestore
 * définies dans /firestore.rules (ABAC, isolation multi-locataires, interdiction des orphelins).
 */

interface AuthContext {
  uid: string;
  token: {
    email?: string;
    email_verified?: boolean;
  };
}

interface TreeDoc {
  ownerId: string;
  ownerEmail?: string;
  editors?: string[];
  viewers?: string[];
  isPublic?: boolean;
}

const ADMIN_EMAIL = 'jeanpierre.nouhailler@gmail.com';

function isSignedIn(auth: AuthContext | null): boolean {
  return auth !== null;
}

function isAdmin(auth: AuthContext | null): boolean {
  return isSignedIn(auth) && auth!.token.email === ADMIN_EMAIL && auth!.token.email_verified === true;
}

function isTreeOwner(auth: AuthContext | null, tree: TreeDoc): boolean {
  if (!isSignedIn(auth)) return false;
  return (
    isAdmin(auth) ||
    tree.ownerId === auth!.uid ||
    (tree.ownerEmail !== undefined && tree.ownerEmail === auth!.token.email)
  );
}

function isTreeEditor(auth: AuthContext | null, tree: TreeDoc): boolean {
  if (!isSignedIn(auth)) return false;
  return (
    isTreeOwner(auth, tree) ||
    (tree.editors !== undefined && tree.editors.includes(auth!.uid))
  );
}

function canReadTree(auth: AuthContext | null, tree: TreeDoc | null, treeExists: boolean): boolean {
  if (!isSignedIn(auth) || !treeExists || !tree) return false;
  return (
    isAdmin(auth) ||
    tree.ownerId === auth!.uid ||
    (tree.ownerEmail !== undefined && tree.ownerEmail === auth!.token.email) ||
    (tree.editors !== undefined && tree.editors.includes(auth!.uid)) ||
    (tree.viewers !== undefined && tree.viewers.includes(auth!.uid)) ||
    tree.isPublic === true
  );
}

function canWriteTree(auth: AuthContext | null, tree: TreeDoc | null, treeExists: boolean): boolean {
  if (!isSignedIn(auth) || !treeExists || !tree) return false;
  return isTreeEditor(auth, tree);
}

function canDeleteTree(auth: AuthContext | null, tree: TreeDoc | null, treeExists: boolean): boolean {
  if (!isSignedIn(auth) || !treeExists || !tree) return false;
  return isTreeOwner(auth, tree);
}

function canReadArchives(auth: AuthContext | null, tree: TreeDoc | null, treeExists: boolean): boolean {
  if (!isSignedIn(auth) || !treeExists || !tree) return false;
  return canReadTree(auth, tree, treeExists);
}

function canWriteArchives(auth: AuthContext | null, tree: TreeDoc | null, treeExists: boolean): boolean {
  if (!isSignedIn(auth) || !treeExists || !tree) return false;
  return isTreeEditor(auth, tree);
}

function canReadAccessRules(auth: AuthContext | null, tree: TreeDoc | null, treeExists: boolean): boolean {
  if (!isSignedIn(auth) || !treeExists || !tree) return false;
  // Les règles d'accès contiennent les clés et tokens sensibles : réservé STRICTEMENT au propriétaire ou admin
  return isTreeOwner(auth, tree);
}

function canWriteAccessRules(auth: AuthContext | null, tree: TreeDoc | null, treeExists: boolean): boolean {
  if (!isSignedIn(auth) || !treeExists || !tree) return false;
  return isTreeOwner(auth, tree);
}

describe('Contrôle des Règles de Sécurité Firestore (P0 - Isolation & Contrôles Stricts)', () => {
  const ownerUser: AuthContext = {
    uid: 'user-famille-martin-uid',
    token: { email: 'martin@example.com', email_verified: true },
  };

  const otherUser: AuthContext = {
    uid: 'user-famille-durand-uid',
    token: { email: 'durand@example.com', email_verified: true },
  };

  const viewerUser: AuthContext = {
    uid: 'user-cousin-lecteur-uid',
    token: { email: 'lecteur@example.com', email_verified: true },
  };

  const editorUser: AuthContext = {
    uid: 'user-cousin-editeur-uid',
    token: { email: 'cousin@example.com', email_verified: true },
  };

  const adminUser: AuthContext = {
    uid: 'admin-super-uid',
    token: { email: ADMIN_EMAIL, email_verified: true },
  };

  const privateMartinTree: TreeDoc = {
    ownerId: 'user-famille-martin-uid',
    ownerEmail: 'martin@example.com',
    editors: ['user-cousin-editeur-uid'],
    viewers: ['user-cousin-lecteur-uid'],
    isPublic: false,
  };

  describe('1. Utilisateur non authentifié ou extérieur', () => {
    it('refuse tout accès à un utilisateur non connecté', () => {
      expect(canReadTree(null, privateMartinTree, true)).toBe(false);
      expect(canWriteTree(null, privateMartinTree, true)).toBe(false);
      expect(canDeleteTree(null, privateMartinTree, true)).toBe(false);
      expect(canReadArchives(null, privateMartinTree, true)).toBe(false);
      expect(canWriteArchives(null, privateMartinTree, true)).toBe(false);
      expect(canReadAccessRules(null, privateMartinTree, true)).toBe(false);
      expect(canWriteAccessRules(null, privateMartinTree, true)).toBe(false);
    });

    it('refuse tout accès à un utilisateur tiers connecté mais extérieur', () => {
      expect(canReadTree(otherUser, privateMartinTree, true)).toBe(false);
      expect(canWriteTree(otherUser, privateMartinTree, true)).toBe(false);
      expect(canDeleteTree(otherUser, privateMartinTree, true)).toBe(false);
      expect(canReadArchives(otherUser, privateMartinTree, true)).toBe(false);
      expect(canWriteArchives(otherUser, privateMartinTree, true)).toBe(false);
      expect(canReadAccessRules(otherUser, privateMartinTree, true)).toBe(false);
      expect(canWriteAccessRules(otherUser, privateMartinTree, true)).toBe(false);
    });
  });

  describe('2. Rôle Lecteur (Viewer)', () => {
    it('autorise le lecteur à lire l’arbre et les archives, mais lui interdit toute écriture', () => {
      expect(canReadTree(viewerUser, privateMartinTree, true)).toBe(true);
      expect(canReadArchives(viewerUser, privateMartinTree, true)).toBe(true);

      expect(canWriteTree(viewerUser, privateMartinTree, true)).toBe(false);
      expect(canWriteArchives(viewerUser, privateMartinTree, true)).toBe(false);
      expect(canDeleteTree(viewerUser, privateMartinTree, true)).toBe(false);
    });

    it('interdit rigoureusement au lecteur de lire les documents de la collection access (protection des jetons)', () => {
      expect(canReadAccessRules(viewerUser, privateMartinTree, true)).toBe(false);
      expect(canWriteAccessRules(viewerUser, privateMartinTree, true)).toBe(false);
    });
  });

  describe('3. Rôle Éditeur (Editor)', () => {
    it('autorise l’éditeur à lire et modifier l’arbre et les archives', () => {
      expect(canReadTree(editorUser, privateMartinTree, true)).toBe(true);
      expect(canWriteTree(editorUser, privateMartinTree, true)).toBe(true);
      expect(canReadArchives(editorUser, privateMartinTree, true)).toBe(true);
      expect(canWriteArchives(editorUser, privateMartinTree, true)).toBe(true);
    });

    it('interdit à l’éditeur de supprimer l’arbre ou de lire/gérer les règles d’accès', () => {
      expect(canDeleteTree(editorUser, privateMartinTree, true)).toBe(false);
      expect(canReadAccessRules(editorUser, privateMartinTree, true)).toBe(false);
      expect(canWriteAccessRules(editorUser, privateMartinTree, true)).toBe(false);
    });
  });

  describe('4. Rôle Propriétaire (Owner)', () => {
    it('donne tous les droits au propriétaire sur son arbre, ses archives et ses règles d’accès', () => {
      expect(canReadTree(ownerUser, privateMartinTree, true)).toBe(true);
      expect(canWriteTree(ownerUser, privateMartinTree, true)).toBe(true);
      expect(canDeleteTree(ownerUser, privateMartinTree, true)).toBe(true);
      expect(canReadArchives(ownerUser, privateMartinTree, true)).toBe(true);
      expect(canWriteArchives(ownerUser, privateMartinTree, true)).toBe(true);
      expect(canReadAccessRules(ownerUser, privateMartinTree, true)).toBe(true);
      expect(canWriteAccessRules(ownerUser, privateMartinTree, true)).toBe(true);
    });
  });

  describe('5. Rôle Administrateur (Admin)', () => {
    it('autorise l’administrateur à superviser l’ensemble des ressources', () => {
      expect(canReadTree(adminUser, privateMartinTree, true)).toBe(true);
      expect(canWriteTree(adminUser, privateMartinTree, true)).toBe(true);
      expect(canDeleteTree(adminUser, privateMartinTree, true)).toBe(true);
      expect(canReadArchives(adminUser, privateMartinTree, true)).toBe(true);
      expect(canWriteArchives(adminUser, privateMartinTree, true)).toBe(true);
      expect(canReadAccessRules(adminUser, privateMartinTree, true)).toBe(true);
      expect(canWriteAccessRules(adminUser, privateMartinTree, true)).toBe(true);
    });
  });

  describe('6. Arbre Inexistant et Sous-collections Orphelines (Exigence P0)', () => {
    it('refuse toute lecture ou écriture si l’arbre parent n’existe pas (treeExists = false)', () => {
      const nonExistentTree = null;
      const treeExists = false;

      // Lecteur
      expect(canReadArchives(viewerUser, nonExistentTree, treeExists)).toBe(false);
      expect(canWriteArchives(viewerUser, nonExistentTree, treeExists)).toBe(false);
      expect(canReadAccessRules(viewerUser, nonExistentTree, treeExists)).toBe(false);

      // Éditeur
      expect(canReadArchives(editorUser, nonExistentTree, treeExists)).toBe(false);
      expect(canWriteArchives(editorUser, nonExistentTree, treeExists)).toBe(false);
      expect(canReadAccessRules(editorUser, nonExistentTree, treeExists)).toBe(false);

      // Tiers extérieur
      expect(canReadArchives(otherUser, nonExistentTree, treeExists)).toBe(false);
      expect(canWriteArchives(otherUser, nonExistentTree, treeExists)).toBe(false);
      expect(canReadAccessRules(otherUser, nonExistentTree, treeExists)).toBe(false);
      expect(canWriteAccessRules(otherUser, nonExistentTree, treeExists)).toBe(false);
    });

    it('interdit l’accès aux sous-collections orphelines même pour un utilisateur authentifié', () => {
      expect(canReadArchives(ownerUser, null, false)).toBe(false);
      expect(canWriteArchives(ownerUser, null, false)).toBe(false);
      expect(canReadAccessRules(ownerUser, null, false)).toBe(false);
      expect(canWriteAccessRules(ownerUser, null, false)).toBe(false);
    });
  });
});
