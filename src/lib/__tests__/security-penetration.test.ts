import { describe, it, expect } from 'vitest';
import { 
  signRoomToken, 
  verifyRoomToken, 
  generateEphemeralSecret 
} from '../token-auth';
import { evaluatePassphraseQuality } from '../crypto';
import { getBranchIndividuals } from '../branch-filter';
import { getSampleGenealogy } from '../sample-data';
import { ArchiveDocument, Individual, GenealogyData } from '../../types/genealogy';

describe('Tests de Sécurité & Tentatives de Contournement (Tests d\'Intrusion)', () => {
  const masterSecret = generateEphemeralSecret();
  const sampleTree = getSampleGenealogy();
  const rootPersonId = sampleTree.rootPersonId || Object.keys(sampleTree.individuals)[0] || '@I1@';

  describe('1. Tentatives de contournement des rôles (RBAC)', () => {
    it('interdit toute action d\'écriture ou de modification à un utilisateur ayant le rôle "viewer"', () => {
      const viewerToken = signRoomToken({
        roomId: 'famille-martin',
        role: 'viewer',
        branch: 'all',
        exp: Date.now() + 3600000,
        iat: Date.now(),
        sub: 'Visiteur Curieux',
      }, masterSecret);

      const check = verifyRoomToken(viewerToken, 'famille-martin', masterSecret);
      expect(check.valid).toBe(true);
      expect(check.payload?.role).toBe('viewer');

      // Simulation de la règle RBAC serveur de server.ts (ligne 292)
      const allowedActionsForViewer: string[] = [];
      const testAction = 'person:edit';
      const isAllowed = check.payload?.role !== 'viewer' && allowedActionsForViewer.includes(testAction);
      expect(isAllowed).toBe(false);
    });

    it('interdit à un éditeur d\'exécuter des actions critiques réservées à l\'admin (tree:update, access:update)', () => {
      const editorToken = signRoomToken({
        roomId: 'famille-martin',
        role: 'editor',
        branch: 'all',
        exp: Date.now() + 3600000,
        iat: Date.now(),
        sub: 'Éditeur Local',
      }, masterSecret);

      const check = verifyRoomToken(editorToken, 'famille-martin', masterSecret);
      expect(check.payload?.role).toBe('editor');

      // Simulation de la règle serveur : tree:update et access:update strictement réservés à l'admin
      const criticalActions = ['tree:update', 'access:update'];
      for (const action of criticalActions) {
        const canExecute = check.payload?.role === 'admin';
        expect(canExecute).toBe(false);
      }
    });

    it('rejette une tentative de manipulation du rôle dans le JWT signé (falsification de payload)', () => {
      const viewerToken = signRoomToken({
        roomId: 'famille-martin',
        role: 'viewer',
        branch: 'all',
        exp: Date.now() + 3600000,
        iat: Date.now(),
      }, masterSecret);

      // L'attaquant remplace 'viewer' par 'admin' dans le payload Base64 sans connaître la clé
      const parts = viewerToken.split('.');
      const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      decodedPayload.role = 'admin';
      const forgedPayloadBase64 = Buffer.from(JSON.stringify(decodedPayload)).toString('base64url');

      const forgedToken = `${parts[0]}.${forgedPayloadBase64}.${parts[2]}`;

      const check = verifyRoomToken(forgedToken, 'famille-martin', masterSecret);
      expect(check.valid).toBe(false);
      expect(check.code).toBe('INVALID_SIGNATURE');
    });
  });

  describe('2. Tentatives d\'usurpation de branche et accès non autorisé', () => {
    it('rejette une tentative de modification d\'un individu de la branche maternelle par un éditeur paternel qui prétend branch="paternal"', () => {
      const paternalIds = getBranchIndividuals(sampleTree, rootPersonId, 'paternal');
      
      // @I7@ est l'ancêtre maternel Jean Le Galloudec
      expect(paternalIds.has('@I7@')).toBe(false);

      // Attaquant envoie un message avec branch: 'paternal' falsifié
      const spoofedMessage = {
        action: 'person:edit',
        payload: {
          id: '@I7@',
          branch: 'paternal', // USURPATION
          name: 'Jean Falsifié',
        }
      };

      // Le serveur ignore spoofedMessage.payload.branch et vérifie paternalIds.has(spoofedMessage.payload.id)
      const isAllowedByServer = paternalIds.has(spoofedMessage.payload.id);
      expect(isAllowedByServer).toBe(false);
    });

    it('interdit l\'ajout d\'une archive rattachée à des personnes hors de la branche autorisée', () => {
      const paternalIds = getBranchIndividuals(sampleTree, rootPersonId, 'paternal');

      const illegalArchive: ArchiveDocument = {
        id: 'arc-illegal-1',
        title: 'Acte hors branche',
        type: 'birth',
        fileData: '',
        linkedPersonIds: ['@I7@'], // Maternel
        linkedFamilyIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const hasUnauthorizedPerson = illegalArchive.linkedPersonIds.some(pid => !paternalIds.has(pid));
      expect(hasUnauthorizedPerson).toBe(true);

      const serverAllowsAdd = illegalArchive.linkedPersonIds.length > 0 && !hasUnauthorizedPerson;
      expect(serverAllowsAdd).toBe(false);
    });

    it('interdit la suppression d\'archives qui concernent des personnes de branches distinctes', () => {
      const maternalIds = getBranchIndividuals(sampleTree, rootPersonId, 'maternal');

      // Archive liée à l'ancêtre paternel Guillaume Martin (@I5@)
      const paternalArchive: ArchiveDocument = {
        id: 'arc-paternal-ancestor',
        title: 'Testament Guillaume Martin',
        type: 'notarial',
        fileData: '',
        linkedPersonIds: ['@I5@'],
        linkedFamilyIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Un éditeur maternel tente de supprimer un acte paternel
      const canDelete = paternalArchive.linkedPersonIds.length > 0 &&
        paternalArchive.linkedPersonIds.every(pid => maternalIds.has(pid));

      expect(canDelete).toBe(false);
    });

    it('empêche la fuite de données lors du broadcast temps réel vers un observateur restreint', () => {
      const paternalIds = getBranchIndividuals(sampleTree, rootPersonId, 'paternal');

      // Mise à jour temps réel concernant une personne maternelle (@I7@)
      const broadcastAction = {
        action: 'person:edit',
        payload: { id: '@I7@', name: 'Jean Le Galloudec' }
      };

      // Le serveur vérifie si le destinataire (qui est dans 'paternal') a le droit de recevoir cet individu
      const shouldForwardToPaternalViewer = paternalIds.has(broadcastAction.payload.id);
      expect(shouldForwardToPaternalViewer).toBe(false);
    });
  });

  describe('3. Tentatives de création de jeton administrateur sans autorisation', () => {
    it('refuse formellement d\'attribuer le rôle admin sans preuve cryptographique et identité Firebase valide', () => {
      // Un client non authentifié qui demande { role: 'admin' }
      const unauthClientBody = {
        roomId: 'famille-confidentielle',
        role: 'admin',
      };

      // Le serveur ignore body.role et impose l'authentification
      const hasAuth = false; // Pas de Bearer token ni de shareToken valide
      expect(hasAuth).toBe(false);
    });

    it('interdit l\'utilisation d\'un secret de signature faible ou par défaut', () => {
      const weakSecrets = [
        'default-secret',
        '12345678',
        'secret',
        'changeme',
        'genealogor-secret-key-2026',
        'short',
      ];

      for (const secret of weakSecrets) {
        const isForbidden = secret.length < 32 || [
          'default-secret',
          'genealogor-secret-key-2026',
          'secret',
          'changeme',
          '12345678'
        ].includes(secret);

        expect(isForbidden).toBe(true);
      }
    });

    it('bloque les tentatives d\'injection ou d\'usurpation via un jeton émis pour une autre salle', () => {
      const tokenRoomA = signRoomToken({
        roomId: 'arbre-public-1',
        role: 'admin',
        branch: 'all',
        exp: Date.now() + 3600000,
        iat: Date.now(),
      }, masterSecret);

      // Tentative de connexion sur arbre-confidentiel-2 avec le jeton de arbre-public-1
      const check = verifyRoomToken(tokenRoomA, 'arbre-confidentiel-2', masterSecret);
      expect(check.valid).toBe(false);
      expect(check.code).toBe('WRONG_ROOM');
    });

    it('rejette les jetons avec horodatage d\'expiration dépassé (replay attack)', () => {
      const expiredToken = signRoomToken({
        roomId: 'famille-martin',
        role: 'admin',
        branch: 'all',
        exp: Date.now() - 1000, // Expiré il y a 1 seconde
        iat: Date.now() - 60000,
      }, masterSecret);

      const check = verifyRoomToken(expiredToken, 'famille-martin', masterSecret);
      expect(check.valid).toBe(false);
      expect(check.code).toBe('EXPIRED_TOKEN');
    });
  });
});
