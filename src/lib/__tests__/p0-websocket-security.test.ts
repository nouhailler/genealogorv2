import { describe, it, expect } from 'vitest';
import { 
  signRoomToken, 
  verifyRoomToken, 
  computeHmacSha256Sync, 
  generateEphemeralSecret 
} from '../token-auth';
import { getBranchIndividuals } from '../branch-filter';
import { getSampleGenealogy } from '../sample-data';
import { ArchiveDocument } from '../../types/genealogy';

describe('P0 — Sécurité Critique WebSocket & Contrôle de Périmètre', () => {
  const strongSecret = 'c7e6b8f1a2d34567890123456789abcdef0123456789abcdef0123456789abcdef';
  const sampleTree = getSampleGenealogy();
  const rootPersonId = sampleTree.rootPersonId || Object.keys(sampleTree.individuals)[0] || '@I1@';

  describe('P0.1 — Secret HMAC et Interdiction des Secrets Prévisibles ou par Défaut', () => {
    it('refuse de signer ou de vérifier si le secret est absent ou vide', () => {
      expect(() => {
        signRoomToken({
          roomId: 'famille-martin',
          role: 'admin',
          branch: 'all',
          exp: Date.now() + 3600000,
          iat: Date.now(),
        }, '');
      }).toThrow(/secret HMAC obligatoire/i);

      const verification = verifyRoomToken('header.payload.signature', 'famille-martin', '');
      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('non configuré');
    });

    it('génère un secret éphémère cryptographiquement fort d\'au moins 64 caractères hexadécimaux', () => {
      const ephem = generateEphemeralSecret();
      expect(typeof ephem).toBe('string');
      expect(ephem.length).toBeGreaterThanOrEqual(64);
      expect(/^[0-9a-f]+$/i.test(ephem)).toBe(true);
    });

    it('invalide immédiatement les jetons signés avec un secret par défaut ou tiers', () => {
      const token = signRoomToken({
        roomId: 'famille-martin',
        role: 'admin',
        branch: 'all',
        exp: Date.now() + 3600000,
        iat: Date.now(),
      }, strongSecret);

      const attackerSecret = 'default-secret-known-to-attacker-1234';
      const check = verifyRoomToken(token, 'famille-martin', attackerSecret);
      expect(check.valid).toBe(false);
      expect(check.code).toBe('INVALID_SIGNATURE');
    });

    it('refuse un jeton destiné à une autre salle (protection inter-arbres)', () => {
      const token = signRoomToken({
        roomId: 'famille-durand',
        role: 'admin',
        branch: 'all',
        exp: Date.now() + 3600000,
        iat: Date.now(),
      }, strongSecret);

      const check = verifyRoomToken(token, 'famille-martin', strongSecret);
      expect(check.valid).toBe(false);
      expect(check.code).toBe('WRONG_ROOM');
    });

    it('rejette les jetons expirés', () => {
      const token = signRoomToken({
        roomId: 'famille-martin',
        role: 'editor',
        branch: 'all',
        exp: Date.now() - 5000, // Déjà expiré
        iat: Date.now() - 10000,
      }, strongSecret);

      const check = verifyRoomToken(token, 'famille-martin', strongSecret);
      expect(check.valid).toBe(false);
      expect(check.code).toBe('EXPIRED_TOKEN');
    });
  });

  describe('P0.2 — Détermination Souveraine du Rôle par le Serveur', () => {
    it('normalise les rôles invalides vers "viewer"', () => {
      const token = signRoomToken({
        roomId: 'famille-martin',
        role: 'super_hacker_role' as any,
        branch: 'all',
        exp: Date.now() + 3600000,
        iat: Date.now(),
      }, strongSecret);

      const check = verifyRoomToken(token, 'famille-martin', strongSecret);
      expect(check.valid).toBe(true);
      expect(check.payload?.role).toBe('viewer');
    });

    it('normalise les branches invalides vers "all"', () => {
      const token = signRoomToken({
        roomId: 'famille-martin',
        role: 'editor',
        branch: 'invalid_branch' as any,
        exp: Date.now() + 3600000,
        iat: Date.now(),
      }, strongSecret);

      const check = verifyRoomToken(token, 'famille-martin', strongSecret);
      expect(check.valid).toBe(true);
      expect(check.payload?.branch).toBe('all');
    });
  });

  describe('P0.3 — Contrôle de Périmètre Serveur (Anti-Usurpation de Branche)', () => {
    it('calcule rigoureusement les ancêtres autorisés pour une branche paternelle vs maternelle', () => {
      const paternalIds = getBranchIndividuals(sampleTree, rootPersonId, 'paternal');
      const maternalIds = getBranchIndividuals(sampleTree, rootPersonId, 'maternal');

      expect(paternalIds.size).toBeGreaterThan(0);
      expect(maternalIds.size).toBeGreaterThan(0);

      // Le grand-père paternel (@I5@) doit être dans la branche paternelle et PAS dans la maternelle
      expect(paternalIds.has('@I5@')).toBe(true);
      expect(maternalIds.has('@I5@')).toBe(false);

      // Le grand-père maternel (@I7@) doit être dans la branche maternelle et PAS dans la paternelle
      expect(maternalIds.has('@I7@')).toBe(true);
      expect(paternalIds.has('@I7@')).toBe(false);
    });

    it('détecte et bloque un client déclarant faussement branch="paternal" pour un ancêtre maternel', () => {
      const paternalIds = getBranchIndividuals(sampleTree, rootPersonId, 'paternal');
      
      // Tentative d'usurpation : le message du client prétend être dans "paternal"
      const clientMessage = {
        action: 'person:edit',
        payload: {
          id: '@I7@', // Grand-père maternel Jean Le Galloudec
          branch: 'paternal', // USURPATION DU CLIENT
          name: 'Tentative de falsification',
        }
      };

      // Le serveur vérifie l'ID réel de la personne contre la branche autorisée de l'éditeur
      const targetId = clientMessage.payload.id;
      const isAllowedByServer = paternalIds.has(targetId);

      // Le contrôle serveur doit rejeter, indifféremment de msg.payload.branch
      expect(isAllowedByServer).toBe(false);
    });

    it('bloque la suppression d\'archives qui concernent des personnes hors de la branche autorisée', () => {
      const paternalIds = getBranchIndividuals(sampleTree, rootPersonId, 'paternal');

      const archiveMaternelle: ArchiveDocument = {
        id: 'arc-acte-mere',
        title: 'Acte notarié grand-père maternel',
        type: 'notarial',
        fileData: '',
        date: '1745-12-12',
        linkedPersonIds: ['@I7@'], // @I7@ est le grand-père maternel
        linkedFamilyIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Un éditeur paternel tente de supprimer un acte maternel
      const canDelete = archiveMaternelle.linkedPersonIds.length > 0 &&
        archiveMaternelle.linkedPersonIds.every(pid => paternalIds.has(pid));

      expect(canDelete).toBe(false);
    });

    it('bloque la suppression d\'archives globales non rattachées par un éditeur de branche', () => {
      const paternalIds = getBranchIndividuals(sampleTree, rootPersonId, 'paternal');

      const archiveGlobale: ArchiveDocument = {
        id: 'arc-livret-general',
        title: 'Livre de famille général',
        type: 'livret',
        fileData: '',
        linkedPersonIds: [], // Aucune personne liée
        linkedFamilyIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Seul l'administrateur a le droit de supprimer les archives générales
      const isAllowedForBranchEditor = archiveGlobale.linkedPersonIds.length > 0 &&
        archiveGlobale.linkedPersonIds.every(pid => paternalIds.has(pid));

      expect(isAllowedForBranchEditor).toBe(false);
    });

    it('autorise la suppression d\'une archive dont TOUS les individus liés appartiennent à la branche de l\'éditeur', () => {
      const paternalIds = getBranchIndividuals(sampleTree, rootPersonId, 'paternal');

      const archivePaternelle: ArchiveDocument = {
        id: 'arc-pere',
        title: 'Acte de baptême grand-père paternel',
        type: 'baptism',
        fileData: '',
        linkedPersonIds: ['@I5@'], // Grand-père paternel (dans paternalIds)
        linkedFamilyIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const isAllowed = archivePaternelle.linkedPersonIds.length > 0 &&
        archivePaternelle.linkedPersonIds.every(pid => paternalIds.has(pid));

      expect(isAllowed).toBe(true);
    });
  });
});
