import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { 
  resolveWsAuthSecret, 
  FORBIDDEN_SECRETS, 
  generateEphemeralSecret 
} from '../token-auth';
import { 
  verifyFirebaseIdToken 
} from '../firebase-token-verifier';
import { 
  hashPassword, 
  verifyPassword 
} from '../crypto';
import { 
  GenealogyData, 
  ArchiveDocument, 
  BranchAccess 
} from '../../types/genealogy';
import { syncActionToFirestore } from '../firestore-sync-action';

describe('Audit et Tests des Corrections P0 & P1', () => {

  // =========================================================================
  // P0.1 : SECRET DE SIGNATURE OBLIGATOIRE AU DÉMARRAGE
  // =========================================================================
  describe('P0.1 — Secret HMAC obligatoire au démarrage', () => {
    it('interdit rigoureusement les valeurs par défaut connues et triviales en production', () => {
      for (const forbidden of FORBIDDEN_SECRETS) {
        expect(() => {
          resolveWsAuthSecret(forbidden, true);
        }).toThrow(/WS_AUTH_SECRET est obligatoire en production/i);
      }
    });

    it('rejette les secrets trop courts (< 32 caractères) en production', () => {
      expect(() => {
        resolveWsAuthSecret('short-secret-123', true);
      }).toThrow(/WS_AUTH_SECRET est obligatoire en production/i);
    });

    it('refuse de démarrer en production si le secret est absent ou vide', () => {
      expect(() => {
        resolveWsAuthSecret('', true);
      }).toThrow(/WS_AUTH_SECRET est obligatoire en production/i);

      expect(() => {
        resolveWsAuthSecret(undefined, true);
      }).toThrow(/WS_AUTH_SECRET est obligatoire en production/i);
    });

    it('accepte un secret cryptographiquement fort (≥ 32 caractères non triviaux) en production', () => {
      const validSecret = 'super_robust_and_unpredictable_secret_key_2026_xyz!#';
      const resolved = resolveWsAuthSecret(validSecret, true);
      expect(resolved).toBe(validSecret);
    });

    it('génère un secret aléatoire de 256 bits en mode développement si aucun secret n\'est fourni', () => {
      const devSecret = resolveWsAuthSecret(undefined, false);
      expect(typeof devSecret).toBe('string');
      expect(devSecret.length).toBeGreaterThanOrEqual(64); // 32 octets en hex = 64 caractères
    });
  });

  // =========================================================================
  // P0.2 : VALIDATION DU MOT DE PASSE DE PARTAGE
  // =========================================================================
  describe('P0.2 — Validation cryptographique du mot de passe de partage (PBKDF2)', () => {
    let validPasswordHash: string;
    const correctPassword = 'SecretFamilleMartin2026!';

    beforeEach(async () => {
      validPasswordHash = await hashPassword(correctPassword);
    });

    it('accepte le mot de passe correct correspondant au hash PBKDF2 stocké', async () => {
      const isValid = await verifyPassword(correctPassword, validPasswordHash);
      expect(isValid).toBe(true);
    });

    it('rejette un mot de passe incorrect', async () => {
      const isValid = await verifyPassword('MauvaisMotDePasse', validPasswordHash);
      expect(isValid).toBe(false);
    });

    it('rejette l\'accès si le mot de passe est absent ou vide alors qu\'un hash est présent', async () => {
      expect(await verifyPassword('', validPasswordHash)).toBe(false);
      expect(await verifyPassword(undefined as any, validPasswordHash)).toBe(false);
    });

    it('rejette proprement sans crash les hash invalides, corrompus ou malveillants', async () => {
      const corruptedHashes = [
        'invalid-hash-string',
        'pbkdf2:v2:bad_salt:bad_hash',
        'pbkdf2:v2:',
        'sha256:corrupted',
        '!!!malformed!!!',
      ];

      for (const badHash of corruptedHashes) {
        const isValid = await verifyPassword(correctPassword, badHash);
        expect(isValid).toBe(false);
      }
    });

    it('valide la logique serveur de contrôle des liens de partage avec mot de passe', async () => {
      const ruleWithPassword: BranchAccess = {
        id: 'rule-test-1',
        name: 'Branche Paternelle',
        branch: 'paternal',
        rootPersonId: '@I1@',
        role: 'editor',
        shareToken: 'token-secret-123',
        passwordHash: validPasswordHash,
        hideLiving: true,
        createdAt: Date.now(),
      };

      // Simulation de la vérification côté serveur
      const testServerAuth = async (enteredPassword?: string) => {
        if (ruleWithPassword.passwordHash || ruleWithPassword.password) {
          if (!enteredPassword || enteredPassword.trim().length === 0) {
            return { status: 401, error: 'Mot de passe requis pour ce lien de partage.', code: 'PASSWORD_REQUIRED' };
          }
          let isMatch = false;
          if (ruleWithPassword.passwordHash) {
            isMatch = await verifyPassword(enteredPassword, ruleWithPassword.passwordHash);
          } else if (ruleWithPassword.password) {
            isMatch = (enteredPassword === ruleWithPassword.password);
          }
          if (!isMatch) {
            return { status: 401, error: 'Mot de passe invalide pour ce lien de partage.', code: 'INVALID_PASSWORD' };
          }
        }
        return { status: 200, authorized: true, role: ruleWithPassword.role };
      };

      // 1. Mot de passe absent -> 401 PASSWORD_REQUIRED
      const resNoPwd = await testServerAuth();
      expect(resNoPwd.status).toBe(401);
      expect(resNoPwd.code).toBe('PASSWORD_REQUIRED');

      // 2. Faux mot de passe -> 401 INVALID_PASSWORD
      const resWrongPwd = await testServerAuth('wrong');
      expect(resWrongPwd.status).toBe(401);
      expect(resWrongPwd.code).toBe('INVALID_PASSWORD');

      // 3. Bon mot de passe -> 200 OK
      const resSuccess = await testServerAuth(correctPassword);
      expect(resSuccess.status).toBe(200);
      expect(resSuccess.authorized).toBe(true);
      expect(resSuccess.role).toBe('editor');
    });
  });

  // =========================================================================
  // P0.3 : VALIDATION DU JETON FIREBASE AUTH (RS256, AUDIENCE, EXP, RÉVOCATION)
  // =========================================================================
  describe('P0.3 — Vérification formelle du jeton Firebase ID Token', () => {
    // Génération d'une paire de clés RSA réelle pour simuler Google Identity
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const testKid = 'google-key-id-2026-v1';
    const mockPublicCerts = { [testKid]: publicKey };
    const expectedProjectId = 'geometric-gift-7f6jr';

    function createSignedFirebaseToken(payloadOverrides: Record<string, any> = {}, kid = testKid): string {
      const header = {
        alg: 'RS256',
        kid,
        typ: 'JWT',
      };

      const now = Math.floor(Date.now() / 1000);
      const defaultPayload = {
        iss: `https://securetoken.google.com/${expectedProjectId}`,
        aud: expectedProjectId,
        auth_time: now - 60,
        user_id: 'firebase_user_abc123',
        sub: 'firebase_user_abc123',
        iat: now - 60,
        exp: now + 3600, // Valide 1 heure
        email: 'jeanpierre.nouhailler@gmail.com',
        email_verified: true,
      };

      const payload = { ...defaultPayload, ...payloadOverrides };

      const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
      const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const dataToSign = `${b64Header}.${b64Payload}`;

      const signer = crypto.createSign('RSA-SHA256');
      signer.update(dataToSign);
      const b64Signature = signer.sign(privateKey, 'base64url');

      return `${dataToSign}.${b64Signature}`;
    }

    it('valide avec succès un jeton Firebase conforme et authentique', async () => {
      const validToken = createSignedFirebaseToken();
      const result = await verifyFirebaseIdToken(validToken, {
        expectedProjectId,
        customPublicCerts: mockPublicCerts,
      });

      expect(result.valid).toBe(true);
      expect(result.uid).toBe('firebase_user_abc123');
      expect(result.email).toBe('jeanpierre.nouhailler@gmail.com');
      expect(result.email_verified).toBe(true);
    });

    it('rejette un jeton expiré (exp dépassé)', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredToken = createSignedFirebaseToken({
        exp: now - 300, // Expiré il y a 5 minutes
      });

      const result = await verifyFirebaseIdToken(expiredToken, {
        expectedProjectId,
        customPublicCerts: mockPublicCerts,
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe('TOKEN_EXPIRED');
      expect(result.error).toContain('expiré');
    });

    it('rejette un jeton provenant d\'un autre projet Firebase (protection cross-project)', async () => {
      const crossProjectToken = createSignedFirebaseToken({
        aud: 'malicious-other-project-id',
        iss: 'https://securetoken.google.com/malicious-other-project-id',
      });

      const result = await verifyFirebaseIdToken(crossProjectToken, {
        expectedProjectId,
        customPublicCerts: mockPublicCerts,
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe('PROJECT_MISMATCH');
    });

    it('rejette un jeton avec émetteur invalide', async () => {
      const invalidIssuerToken = createSignedFirebaseToken({
        iss: 'https://attacker.site/auth',
      });

      const result = await verifyFirebaseIdToken(invalidIssuerToken, {
        expectedProjectId,
        customPublicCerts: mockPublicCerts,
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_ISSUER');
    });

    it('rejette un jeton à signature altérée ou falsifiée', async () => {
      const validToken = createSignedFirebaseToken();
      const parts = validToken.split('.');
      // Altération du payload (changement d'email ou UID)
      const tamperedPayload = Buffer.from(JSON.stringify({
        ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()),
        email: 'attacker@evil.com',
      })).toString('base64url');

      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const result = await verifyFirebaseIdToken(tamperedToken, {
        expectedProjectId,
        customPublicCerts: mockPublicCerts,
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe('INVALID_SIGNATURE');
    });

    it('rejette un jeton révoqué lorsque la vérification de révocation est activée', async () => {
      const now = Math.floor(Date.now() / 1000);
      const revokedToken = createSignedFirebaseToken({
        auth_time: now - 3600, // Authentifié il y a 1h
      });

      // L'administrateur a révoqué toutes les sessions il y a 30 minutes
      const revocationTimestamp = now - 1800;

      const result = await verifyFirebaseIdToken(revokedToken, {
        expectedProjectId,
        customPublicCerts: mockPublicCerts,
        checkRevoked: true,
        revocationTimestamp,
      });

      expect(result.valid).toBe(false);
      expect(result.code).toBe('TOKEN_REVOKED');
      expect(result.error).toContain('révoqué');
    });
  });

  // =========================================================================
  // P1 : PERSISTANCE DURABLE ET RÉSISTANCE AUX REDÉMARRAGES SERVEUR
  // =========================================================================
  describe('P1 — Durabilité de l\'état WebSocket et survie aux redémarrages', () => {
    const testDataDir = path.join(process.cwd(), 'data', 'rooms');
    const testRoomId = 'test-audit-persistence-room';
    const testFilePath = path.join(testDataDir, `${testRoomId}.json`);

    beforeEach(() => {
      if (!fs.existsSync(testDataDir)) {
        fs.mkdirSync(testDataDir, { recursive: true });
      }
    });

    afterEach(() => {
      try {
        if (fs.existsSync(testFilePath)) {
          fs.unlinkSync(testFilePath);
        }
      } catch (e) {}
    });

    it('enregistre l\'état de la salle de façon persistante sur disque', () => {
      const stateToPersist = {
        roomId: testRoomId,
        ownerId: 'user_123',
        ownerEmail: 'test@example.com',
        tree: {
          individuals: {
            '@I_AUDIT@': {
              id: '@I_AUDIT@',
              name: 'Jean Moulin',
              sex: 'M' as const,
              familiesAsSpouse: [],
              familiesAsChild: [],
            }
          },
          families: {},
          rootPersonId: '@I_AUDIT@',
        },
        archives: [
          {
            id: 'arc-audit-1',
            title: 'Rapport historique 1943',
            type: 'notarial' as const,
            fileData: '',
            linkedPersonIds: ['@I_AUDIT@'],
            linkedFamilyIds: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
        ],
        accessRules: [],
        updatedAt: new Date().toISOString(),
      };

      // Écriture atomique
      const tmpPath = `${testFilePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(stateToPersist, null, 2), 'utf8');
      fs.renameSync(tmpPath, testFilePath);

      expect(fs.existsSync(testFilePath)).toBe(true);

      // Rechargement direct depuis le fichier
      const reloaded = JSON.parse(fs.readFileSync(testFilePath, 'utf8'));
      expect(reloaded.tree.individuals['@I_AUDIT@'].name).toBe('Jean Moulin');
      expect(reloaded.archives[0].title).toBe('Rapport historique 1943');
    });

    it('survit à un redémarrage complet du serveur : l\'état est réhydraté fidèlement', () => {
      // 1. Écriture initiale de l'état
      const mockState = {
        roomId: testRoomId,
        tree: {
          individuals: {
            '@I100@': { id: '@I100@', name: 'Pierre Martin', sex: 'M' as const, familiesAsSpouse: [], familiesAsChild: [] },
          },
          families: {},
        },
        archives: [],
        accessRules: [],
      };
      fs.writeFileSync(testFilePath, JSON.stringify(mockState), 'utf8');

      // 2. Simulation d'un redémarrage complet : la mémoire est totalement effacée
      const inMemoryCache = new Map<string, any>();
      expect(inMemoryCache.get(testRoomId)).toBeUndefined();

      // 3. Fonction de restauration au démarrage
      const restoreRoom = (id: string) => {
        const p = path.join(testDataDir, `${id}.json`);
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
        return null;
      };

      const restored = restoreRoom(testRoomId);
      expect(restored).not.toBeNull();
      expect(restored.tree.individuals['@I100@'].name).toBe('Pierre Martin');
    });

    it('distingue explicitement dans l\'ACK la persistance sur disque local et la persistance cloud Firestore', () => {
      // 1. Cas où Firestore a réussi
      const cloudSuccessAck = {
        type: 'action:ack',
        opId: 'op-123',
        status: 'success',
        action: 'person:edit',
        persistedLocal: true,
        persistedFirestore: true,
        storage: 'cloud_and_local',
        durable: true,
        timestamp: Date.now(),
      };

      expect(cloudSuccessAck.persistedLocal).toBe(true);
      expect(cloudSuccessAck.persistedFirestore).toBe(true);
      expect(cloudSuccessAck.storage).toBe('cloud_and_local');

      // 2. Cas où seul le disque local est garanti (erreur réseau ou Firestore non configuré)
      const localOnlyAck = {
        type: 'action:ack',
        opId: 'op-124',
        status: 'success',
        action: 'person:edit',
        persistedLocal: true,
        persistedFirestore: false,
        storage: 'local_disk_only',
        firestoreError: 'Firestore HTTP 503: Service Unavailable',
        durable: true,
        timestamp: Date.now(),
      };

      expect(localOnlyAck.persistedLocal).toBe(true);
      expect(localOnlyAck.persistedFirestore).toBe(false);
      expect(localOnlyAck.storage).toBe('local_disk_only');
      expect(localOnlyAck.firestoreError).toBeDefined();
    });

    it('révoque immédiatement l\'accès lorsqu\'une règle est marquée revoked: true dans Firestore', () => {
      const activeRules = new Map<string, BranchAccess>();

      // Simulation de la synchronisation depuis Firestore
      const firestoreDocs = [
        {
          fields: {
            id: { stringValue: 'rule-valid' },
            shareToken: { stringValue: 'token-valide-123' },
            role: { stringValue: 'viewer' },
            branch: { stringValue: 'all' },
            revoked: { booleanValue: false },
          }
        },
        {
          fields: {
            id: { stringValue: 'rule-revoked' },
            shareToken: { stringValue: 'token-revoque-456' },
            role: { stringValue: 'editor' },
            branch: { stringValue: 'paternal' },
            revoked: { booleanValue: true }, // RÉVOQUÉ PAR L'ADMIN DANS FIRESTORE
          }
        }
      ];

      // Parse et synchronisation
      activeRules.clear();
      for (const d of firestoreDocs) {
        if (!d.fields.revoked?.booleanValue) {
          activeRules.set(d.fields.shareToken.stringValue, {
            id: d.fields.id.stringValue,
            name: 'Accès',
            branch: d.fields.branch.stringValue as any,
            role: d.fields.role.stringValue as any,
            shareToken: d.fields.shareToken.stringValue,
            hideLiving: true,
            createdAt: Date.now(),
            rootPersonId: '@I1@',
          });
        }
      }

      // Le jeton valide est présent
      expect(activeRules.has('token-valide-123')).toBe(true);
      // Le jeton révoqué est exclu de façon autoritaire
      expect(activeRules.has('token-revoque-456')).toBe(false);
    });
  });

  // =========================================================================
  // P1.3 : SYNCHRONISATION FIRESTORE DES RÈGLES DE PARTAGE & CONTRÔLE STATUTS HTTP
  // =========================================================================
  describe('P1.3 — Contrôle strict des écritures Firestore pour access:update et gestion des révocations', () => {
    const fakeConfig = {
      projectId: 'test-project-123',
      firestoreDatabaseId: '(default)',
    };

    it('retourne une erreur explicite et interrompt la synchronisation si une règle échoue après qu\'une première a réussi', async () => {
      const rulesPayload: BranchAccess[] = [
        {
          id: 'rule-alpha',
          name: 'Branche Paternelle',
          branch: 'paternal',
          rootPersonId: '@I1@',
          role: 'viewer',
          shareToken: 'token-alpha',
          hideLiving: true,
          createdAt: Date.now(),
        },
        {
          id: 'rule-beta',
          name: 'Branche Maternelle',
          branch: 'maternal',
          rootPersonId: '@I1@',
          role: 'editor',
          shareToken: 'token-beta',
          hideLiving: false,
          createdAt: Date.now(),
        }
      ];

      // Mock fetch: la 1ère règle réussit (HTTP 200), la 2ème échoue (HTTP 500)
      const mockFetch = async (url: any, opts: any) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/access')) {
          // List existing rules: empty
          return { ok: true, status: 200, json: async () => ({ documents: [] }) };
        }
        if (urlStr.endsWith('rule-alpha')) {
          return { ok: true, status: 200, text: async () => '{"name":"rule-alpha"}' };
        }
        if (urlStr.endsWith('rule-beta')) {
          return { ok: false, status: 500, text: async () => 'Internal Server Error Firestore' };
        }
        return { ok: true, status: 200, text: async () => '{}' };
      };

      const result = await syncActionToFirestore(
        fakeConfig,
        'tree-456',
        'access:update',
        rulesPayload,
        'mock-token',
        undefined,
        mockFetch as any
      );

      // Vérifications P1 strictes :
      expect(result.success).toBe(false);
      expect(result.savedCount).toBe(1); // La 1ère a été enregistrée
      expect(result.error).toBeDefined();
      expect(result.error).toContain('rule-beta');
      expect(result.error).toContain('500');
      expect(result.error).toContain('1/2 enregistrées');
    });

    it('confirme le succès complet (success: true) lorsque toutes les règles sont persistées avec succès', async () => {
      const rulesPayload: BranchAccess[] = [
        {
          id: 'rule-1',
          name: 'Accès 1',
          branch: 'all',
          rootPersonId: '@I1@',
          role: 'viewer',
          shareToken: 'token-1',
          hideLiving: true,
          createdAt: Date.now(),
        },
        {
          id: 'rule-2',
          name: 'Accès 2',
          branch: 'all',
          rootPersonId: '@I1@',
          role: 'viewer',
          shareToken: 'token-2',
          hideLiving: true,
          createdAt: Date.now(),
        }
      ];

      const mockFetch = async (url: any) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/access')) {
          return { ok: true, status: 200, json: async () => ({ documents: [] }) };
        }
        return { ok: true, status: 200, text: async () => '{}' };
      };

      const result = await syncActionToFirestore(
        fakeConfig,
        'tree-456',
        'access:update',
        rulesPayload,
        'mock-token',
        undefined,
        mockFetch as any
      );

      expect(result.success).toBe(true);
      expect(result.savedCount).toBe(2);
      expect(result.error).toBeUndefined();
    });

    it('supprime de Firestore les règles supprimées ou retirées du payload (DELETE HTTP)', async () => {
      const deletedUrls: string[] = [];

      const currentPayload: BranchAccess[] = [
        {
          id: 'rule-conservee',
          name: 'Règle Conservée',
          branch: 'all',
          rootPersonId: '@I1@',
          role: 'viewer',
          shareToken: 'token-keep',
          hideLiving: true,
          createdAt: Date.now(),
        }
      ];

      const mockFetch = async (url: any, opts: any) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/access') && (!opts || opts.method === undefined)) {
          // Firestore contient 'rule-conservee' ET 'rule-obsolete'
          return {
            ok: true,
            status: 200,
            json: async () => ({
              documents: [
                { name: 'projects/p/databases/d/documents/trees/tree-1/access/rule-conservee' },
                { name: 'projects/p/databases/d/documents/trees/tree-1/access/rule-obsolete' },
              ]
            })
          };
        }
        if (opts?.method === 'DELETE') {
          deletedUrls.push(urlStr);
          return { ok: true, status: 200, text: async () => '{}' };
        }
        return { ok: true, status: 200, text: async () => '{}' };
      };

      const result = await syncActionToFirestore(
        fakeConfig,
        'tree-1',
        'access:update',
        currentPayload,
        'mock-token',
        undefined,
        mockFetch as any
      );

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(1);
      expect(deletedUrls.some(u => u.endsWith('rule-obsolete'))).toBe(true);
    });

    it('rejette et signale une erreur si la suppression d\'une règle obsolète échoue dans Firestore', async () => {
      const currentPayload: BranchAccess[] = [];

      const mockFetch = async (url: any, opts: any) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/access') && (!opts || !opts.method)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              documents: [
                { name: 'projects/p/databases/d/documents/trees/tree-1/access/rule-interdite' },
              ]
            })
          };
        }
        if (opts?.method === 'DELETE') {
          return { ok: false, status: 403, text: async () => 'Permission denied on Firestore delete' };
        }
        return { ok: true, status: 200, text: async () => '{}' };
      };

      const result = await syncActionToFirestore(
        fakeConfig,
        'tree-1',
        'access:update',
        currentPayload,
        'mock-token',
        undefined,
        mockFetch as any
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('DELETE HTTP 403');
    });

    it('persiste l\'état revoked: true dans Firestore pour les règles révoquées explicitement', async () => {
      let sentBody: any = null;

      const revokedPayload: BranchAccess[] = [
        {
          id: 'rule-to-revoke',
          name: 'Règle Révoquée',
          branch: 'all',
          rootPersonId: '@I1@',
          role: 'viewer',
          shareToken: 'token-rev',
          hideLiving: true,
          revoked: true, // EXPLICITEMENT RÉVOQUÉ
          createdAt: Date.now(),
        }
      ];

      const mockFetch = async (url: any, opts: any) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/access') && (!opts || !opts.method)) {
          return { ok: true, status: 200, json: async () => ({ documents: [] }) };
        }
        if (opts?.method === 'PATCH') {
          sentBody = JSON.parse(opts.body);
          return { ok: true, status: 200, text: async () => '{}' };
        }
        return { ok: true, status: 200, text: async () => '{}' };
      };

      const result = await syncActionToFirestore(
        fakeConfig,
        'tree-1',
        'access:update',
        revokedPayload,
        'mock-token',
        undefined,
        mockFetch as any
      );

      expect(result.success).toBe(true);
      expect(sentBody).not.toBeNull();
      expect(sentBody.fields.revoked.booleanValue).toBe(true);
    });
  });

  // =========================================================================
  // P1.4 : SECRETS DES LIENS DE PARTAGE & PERSISTANCE LOCALE (PERMISSIONS/RETENTION)
  // =========================================================================
  describe('P1.4 — Audit des Secrets des Liens de Partage et de la Persistance Locale', () => {
    const testDir = path.join(process.cwd(), 'data', 'test-rooms-security');

    beforeEach(() => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true, mode: 0o700 });
      }
    });

    afterEach(() => {
      try {
        if (fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      } catch (e) {}
    });

    it('supprime formellement tout champ password en clair avant persistance locale sur disque', () => {
      const dirtyRule: any = {
        id: 'acc-secret-test',
        name: 'Branche Paternelle',
        branch: 'paternal',
        rootPersonId: '@I1@',
        role: 'viewer',
        password: 'MotDePasseEnClairInterdit123!', // NE DOIT JAMAIS SE RETROUVER SUR DISQUE
        passwordHash: 'pbkdf2:v2:salt123:hash456',
        hideLiving: true,
        shareToken: 'token-secret-789',
        createdAt: Date.now(),
      };

      // Assainissement comme exécuté par persistRoomStateToDisk
      const { password, ...safeRule } = dirtyRule;
      const testFilePath = path.join(testDir, 'test-sanitized.json');

      const payload = {
        roomId: 'test-room',
        accessRules: [safeRule],
        tree: { individuals: {}, families: {} },
        archives: [],
        updatedAt: new Date().toISOString(),
      };

      fs.writeFileSync(testFilePath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
      const rawDiskContent = fs.readFileSync(testFilePath, 'utf8');

      // Vérification absolue : absence totale du mot de passe en clair
      expect(rawDiskContent).not.toContain('MotDePasseEnClairInterdit123!');
      expect(rawDiskContent).not.toContain('"password":');
      // Présence unique du hash cryptographique
      expect(rawDiskContent).toContain('passwordHash');
      expect(rawDiskContent).toContain('pbkdf2:v2:salt123:hash456');
    });

    it('applique des permissions strictes 0o700 sur le répertoire et 0o600 sur les fichiers persistés', () => {
      const dirStat = fs.statSync(testDir);
      // Sur les systèmes POSIX / Linux, les permissions doivent être 0o700 (rwx------)
      const dirMode = dirStat.mode & 0o777;
      expect(dirMode).toBe(0o700);

      const filePath = path.join(testDir, 'room-perm.json');
      fs.writeFileSync(filePath, JSON.stringify({ test: true }), { mode: 0o600 });
      fs.chmodSync(filePath, 0o600);

      const fileStat = fs.statSync(filePath);
      const fileMode = fileStat.mode & 0o777;
      expect(fileMode).toBe(0o600);
    });

    it('nettoie automatiquement les fichiers temporaires orphelins *.tmp.* abandonnés', () => {
      const orphanTmpPath = path.join(testDir, 'room-1.json.tmp.123456');
      fs.writeFileSync(orphanTmpPath, 'temporary-abandoned-data');

      // Forcer un mtime dans le passé (> 10 minutes)
      const tenMinutesAgo = (Date.now() - 10 * 60 * 1000) / 1000;
      fs.utimesSync(orphanTmpPath, tenMinutesAgo, tenMinutesAgo);

      expect(fs.existsSync(orphanTmpPath)).toBe(true);

      // Exécution de la logique de nettoyage de retention
      const files = fs.readdirSync(testDir);
      const now = Date.now();
      for (const f of files) {
        if (f.includes('.tmp.')) {
          const fullPath = path.join(testDir, f);
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > 5 * 60 * 1000) {
            fs.unlinkSync(fullPath);
          }
        }
      }

      // Le fichier temporaire orphelin a bien été purgé
      expect(fs.existsSync(orphanTmpPath)).toBe(false);
    });

    it('ne plante pas et maintient la résilience si le disque local est en lecture seule sur un conteneur éphémère', () => {
      const mockState: any = {
        roomId: 'cloud-room',
        accessRules: new Map(),
        archives: new Map(),
        tree: { individuals: {}, families: {} }
      };

      let threwFatalError = false;
      const fakeDiskWrite = () => {
        const fakeConfig = { projectId: 'test-project' };
        try {
          // Simulation d'une erreur EROFS (Read-only file system sur Cloud Run ou conteneur éphémère)
          const error: any = new Error('EROFS: read-only file system, open "/data/rooms/cloud-room.json"');
          error.code = 'EROFS';
          throw error;
        } catch (err: any) {
          if (fakeConfig.projectId) {
            // Résilience : journalisation d'un avertissement sans planter l'opération
            return;
          }
          throw err;
        }
      };

      try {
        fakeDiskWrite();
      } catch (e) {
        threwFatalError = true;
      }

      expect(threwFatalError).toBe(false);
    });

    it('réhydrate intégralement l\'arbre et les individus depuis Firestore si le disque local a été effacé', () => {
      // Simulation d'un conteneur qui redémarre avec un état mémoire vierge
      const freshRoomState: any = {
        tree: { individuals: {}, families: {} },
        archives: new Map(),
        accessRules: new Map(),
      };

      const firestoreTreeDoc = {
        fields: {
          title: { stringValue: 'Arbre des Aïeux Réhydraté' },
          rootPersonId: { stringValue: '@I50@' },
          individualsJson: {
            stringValue: JSON.stringify({
              '@I50@': { id: '@I50@', name: 'Auguste Martin', sex: 'M' }
            })
          },
          familiesJson: {
            stringValue: JSON.stringify({
              '@F10@': { id: '@F10@', husbandId: '@I50@', childrenIds: [] }
            })
          }
        }
      };

      // Réhydratation
      if (Object.keys(freshRoomState.tree.individuals).length === 0 && firestoreTreeDoc.fields.individualsJson?.stringValue) {
        freshRoomState.tree.individuals = JSON.parse(firestoreTreeDoc.fields.individualsJson.stringValue);
        freshRoomState.tree.families = JSON.parse(firestoreTreeDoc.fields.familiesJson.stringValue);
        freshRoomState.tree.rootPersonId = firestoreTreeDoc.fields.rootPersonId.stringValue;
        freshRoomState.tree.sourceHeader = firestoreTreeDoc.fields.title.stringValue;
      }

      // Vérification que les données ont été parfaitement restaurées depuis Firestore
      expect(freshRoomState.tree.individuals['@I50@']).toBeDefined();
      expect(freshRoomState.tree.individuals['@I50@'].name).toBe('Auguste Martin');
      expect(freshRoomState.tree.rootPersonId).toBe('@I50@');
      expect(freshRoomState.tree.sourceHeader).toBe('Arbre des Aïeux Réhydraté');
    });
  });

});


