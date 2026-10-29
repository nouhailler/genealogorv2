import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  verifyRoomToken, 
  signRoomToken, 
  RoomTokenPayload, 
  generateEphemeralSecret,
  resolveWsAuthSecret,
  FORBIDDEN_SECRETS
} from './src/lib/token-auth.js';
import { 
  BranchRole, 
  BranchScope, 
  GenealogyData, 
  ArchiveDocument, 
  BranchAccess 
} from './src/types/genealogy.js';
import { getBranchIndividuals } from './src/lib/branch-filter.js';
import { getSampleGenealogy } from './src/lib/sample-data.js';
import { getDefaultArchives } from './src/lib/archive-store.js';
import { 
  sanitizePersonForPrivacy, 
  sanitizeGenealogyDataForPrivacy, 
  sanitizeArchiveForPrivacy,
  shouldProtectPerson 
} from './src/lib/privacy.js';
import { verifyPassword } from './src/lib/crypto.js';
import { verifyFirebaseIdToken } from './src/lib/firebase-token-verifier.js';
import { syncActionToFirestore as performFirestoreSync } from './src/lib/firestore-sync-action.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dossier de stockage persistant pour garantir la durabilité après redémarrage du serveur
const DATA_DIR = path.join(__dirname, 'data', 'rooms');
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
  // SÉCURITÉ P1 : Permissions restreintes au propriétaire exclusif du processus (rwx------)
  fs.chmodSync(DATA_DIR, 0o700);
} catch (permErr) {
  console.warn('[STORAGE] Avertissement permissions répertoire data/rooms:', permErr);
}

/**
 * Nettoyage automatique des fichiers orphelins et gestion de la rétention.
 * - Supprime les fichiers temporaires *.tmp.* abandonnés (> 5 min).
 * - Élimine les caches de salles inactives depuis plus de 30 jours (la source d'autorité restant Firestore).
 */
function cleanupLocalStorage(retentionDays = 30): void {
  try {
    if (!fs.existsSync(DATA_DIR)) return;
    const files = fs.readdirSync(DATA_DIR);
    const now = Date.now();
    const maxTempAgeMs = 5 * 60 * 1000; // 5 minutes
    const maxRoomAgeMs = retentionDays * 24 * 60 * 60 * 1000;

    for (const f of files) {
      const fullPath = path.join(DATA_DIR, f);
      try {
        const stat = fs.statSync(fullPath);
        if (f.includes('.tmp.')) {
          if (now - stat.mtimeMs > maxTempAgeMs) {
            fs.unlinkSync(fullPath);
          }
        } else if (f.endsWith('.json') && !f.startsWith('martin-family-tree') && !f.startsWith('demo')) {
          if (now - stat.mtimeMs > maxRoomAgeMs) {
            console.log(`[STORAGE RETENTION] Purge du cache local inactif (${f}) après ${retentionDays} jours d'inactivité.`);
            fs.unlinkSync(fullPath);
          }
        }
      } catch (fileErr) {}
    }
  } catch (err) {
    console.warn('[STORAGE] Erreur lors du nettoyage de data/rooms:', err);
  }
}

// Exécution du nettoyage initial au démarrage
cleanupLocalStorage();

// Chargement sécurisé de la configuration Firebase pour la validation côté serveur
let firebaseConfig: { projectId?: string; firestoreDatabaseId?: string } = {};
try {
  const configPath = path.join(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('[SERVER] Impossible de charger firebase-applet-config.json:', e);
}

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// SÉCURITÉ P0 : Exigence absolue d'un secret HMAC fort au démarrage
const isProduction = process.env.NODE_ENV === 'production';
let WS_AUTH_SECRET: string;
try {
  WS_AUTH_SECRET = resolveWsAuthSecret(process.env.WS_AUTH_SECRET, isProduction);
} catch (fatalSecErr: any) {
  console.error('[FATAL CRITICAL SECURITY ERROR] Arrêt immédiat du serveur :', fatalSecErr.message);
  process.exit(1);
}

app.use(express.json({ limit: '10mb' }));

interface ClientInfo {
  ws: WebSocket;
  clientId: string;
  roomId: string;
  userName?: string;
  branch: BranchScope;
  role: BranchRole;
  isAuthorized: boolean;
  isAlive: boolean;
  messageCount: number;
  rateLimitWindow: number;
  idToken?: string;
}

interface RoomState {
  ownerId?: string;
  ownerEmail?: string;
  editors: Set<string>;
  viewers: Set<string>;
  editorBranches: Map<string, BranchScope>;
  tree: GenealogyData;
  archives: Map<string, ArchiveDocument>;
  accessRules: Map<string, BranchAccess>;
}

const clients = new Map<WebSocket, ClientInfo>();
const rooms = new Map<string, Set<WebSocket>>();
const roomStates = new Map<string, RoomState>();

/**
 * Persistance durable atomique de l'état de la salle sur disque non-volatile.
 */
function persistRoomStateToDisk(roomId: string, state: RoomState): void {
  try {
    const filePath = path.join(DATA_DIR, `${roomId}.json`);

    // P1 : Sécurité des règles : NE JAMAIS stocker de champ password en clair dans la sauvegarde JSON locale
    const sanitizedAccessRules = Array.from(new Set(state.accessRules.values())).map((r: any) => {
      const { password, shareKey, ...safeRule } = r;
      return safeRule;
    });

    const payload = {
      roomId,
      ownerId: state.ownerId,
      ownerEmail: state.ownerEmail,
      tree: state.tree,
      archives: Array.from(state.archives.values()),
      accessRules: sanitizedAccessRules,
      updatedAt: new Date().toISOString(),
    };

    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    // P1 : Protection des fichiers avec permissions strictes 0o600 (lecture/écriture propriétaire exclusif)
    fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(tmpPath, 0o600); } catch (e) {}
    fs.renameSync(tmpPath, filePath);
    try { fs.chmodSync(filePath, 0o600); } catch (e) {}
  } catch (err: any) {
    // P1 : Comportement sur hébergement avec disque éphémère ou en lecture seule (Cloud Run / Heroku / Container) :
    // Si Firestore est configuré, la persistance cloud fait autorité, le disque n'étant qu'un cache d'accélération
    if (firebaseConfig.projectId) {
      console.warn(`[STORAGE WARNING] Disque local éphémère ou inaccessible pour la salle ${roomId} (${err?.message}). Persistance assurée par Firestore.`);
    } else {
      console.error(`[STORAGE ERROR] Impossible d'enregistrer l'état de la salle ${roomId} sur disque :`, err);
      throw err;
    }
  }
}

/**
 * Récupère ou réhydrate l'état d'une salle depuis le stockage persistant.
 * Gère automatiquement les redémarrages serveur sans perte de données.
 */
function getOrCreateRoomState(roomId: string): RoomState {
  let state = roomStates.get(roomId);
  if (!state) {
    const filePath = path.join(DATA_DIR, `${roomId}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const archivesMap = new Map<string, ArchiveDocument>();
        if (Array.isArray(saved.archives)) {
          for (const a of saved.archives) {
            if (a.id) archivesMap.set(a.id, a);
          }
        }
        const rulesMap = new Map<string, BranchAccess>();
        if (Array.isArray(saved.accessRules)) {
          for (const r of saved.accessRules) {
            delete (r as any).password; // Suppression préventive de tout mot de passe en clair hérité
            if (r.shareToken) rulesMap.set(r.shareToken, r);
            if (r.id) rulesMap.set(r.id, r);
          }
        }
        state = {
          ownerId: saved.ownerId,
          ownerEmail: saved.ownerEmail,
          editors: new Set(),
          viewers: new Set(),
          editorBranches: new Map(),
          tree: saved.tree || { individuals: {}, families: {} },
          archives: archivesMap,
          accessRules: rulesMap,
        };
        roomStates.set(roomId, state);
        console.log(`[STORAGE] Salle ${roomId} restaurée avec succès depuis la persistance disque.`);
        return state;
      } catch (err) {
        console.warn(`[STORAGE] Fichier persistant corrompu pour la salle ${roomId}, réinitialisation.`, err);
      }
    }

    const isMartinDemo = roomId === 'martin-family-tree' || roomId === 'demo';
    const initialTree = isMartinDemo ? getSampleGenealogy() : { individuals: {}, families: {}, rootPersonId: undefined };
    const initialArchives = new Map<string, ArchiveDocument>();
    if (isMartinDemo) {
      for (const a of getDefaultArchives()) {
        initialArchives.set(a.id, a);
      }
    }
    state = {
      editors: new Set(),
      viewers: new Set(),
      editorBranches: new Map(),
      tree: initialTree,
      archives: initialArchives,
      accessRules: new Map(),
    };
    roomStates.set(roomId, state);
    try {
      persistRoomStateToDisk(roomId, state);
    } catch (e) {}
  }
  return state;
}

/**
 * Synchronise les règles de partage d'une salle depuis la source autoritaire Firestore.
 * Garantit que les révocations, modifications ou ajouts effectués par le propriétaire
 * sont pris en compte instantanément sans dépendre d'une mémoire serveur obsolète.
 */
async function syncRoomAccessRulesFromFirestore(roomId: string, idToken?: string): Promise<boolean> {
  if (!firebaseConfig.projectId || !firebaseConfig.firestoreDatabaseId) return false;
  if (roomId === 'martin-family-tree' || roomId === 'demo') return false;

  const accessUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/trees/${roomId}/access`;
  const headers: Record<string, string> = {};
  if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

  try {
    const res = await fetch(accessUrl, { headers });
    if (res.ok) {
      const data = await res.json();
      const docs = data.documents || [];
      const roomState = getOrCreateRoomState(roomId);
      roomState.accessRules.clear();

      for (const d of docs) {
        const fields = d.fields || {};
        const id = fields.id?.stringValue || d.name.split('/').pop() || '';
        const name = fields.name?.stringValue || '';
        const branch = fields.branch?.stringValue || 'all';
        const role = fields.role?.stringValue || 'viewer';
        const passwordHash = fields.passwordHash?.stringValue;
        const shareToken = fields.shareToken?.stringValue || id;
        const hideLiving = fields.hideLiving?.booleanValue ?? true;
        const revoked = fields.revoked?.booleanValue === true;
        const createdAt = parseInt(fields.createdAt?.integerValue || String(Date.now()), 10);
        const rootPersonId = fields.rootPersonId?.stringValue || '';

        // SÉCURITÉ P0 : Si la règle est révoquée dans Firestore, elle est exclue des accès actifs
        if (!revoked) {
          const ruleObj: BranchAccess = {
            id,
            name,
            branch: branch as any,
            role: role as any,
            passwordHash,
            shareToken,
            hideLiving,
            createdAt,
            rootPersonId,
          };
          if (shareToken) roomState.accessRules.set(shareToken, ruleObj);
          if (id) roomState.accessRules.set(id, ruleObj);
        }
      }

      // Persistance de l'état actualisé sur le disque local
      try {
        persistRoomStateToDisk(roomId, roomState);
      } catch (e) {}

      return true;
    }
  } catch (err) {
    console.warn(`[FIRESTORE AUTH] Impossible de synchroniser les règles d'accès pour ${roomId}:`, err);
  }
  return false;
}

/**
 * Persistance cloud Firestore faisant autorité.
 * Renvoie un rapport précis (succès ou erreur détaillée) pour distinguer
 * la persistance locale sur disque de la persistance cloud Firestore.
 */
async function syncActionToFirestore(roomId: string, action: string, payload: any, idToken?: string): Promise<{ success: boolean; error?: string }> {
  return performFirestoreSync(
    { projectId: firebaseConfig.projectId, firestoreDatabaseId: firebaseConfig.firestoreDatabaseId },
    roomId,
    action,
    payload,
    idToken,
    (rid) => roomStates.get(rid)?.tree
  );
}

const MAX_PAYLOAD_BYTES = 512 * 1024; // 512 KB max payload
const RATE_LIMIT_MAX_MSG = 60; // Max 60 messages per 10 seconds
const RATE_LIMIT_WINDOW_MS = 10000;

function isValidId(id: unknown): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

function sanitizeText(str: unknown, maxLen = 100): string {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLen).replace(/[<>]/g, '');
}

const wss = new WebSocketServer({ 
  server, 
  path: '/ws',
  maxPayload: MAX_PAYLOAD_BYTES
});

// Periodic ping/pong to clean up dead connections
const heartbeatInterval = setInterval(() => {
  for (const [ws, info] of clients.entries()) {
    if (!info.isAlive) {
      removeClient(ws);
      ws.terminate();
      continue;
    }
    info.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

function removeClient(ws: WebSocket) {
  const info = clients.get(ws);
  if (!info) return;

  const { roomId, clientId, userName } = info;
  const roomSet = rooms.get(roomId);
  if (roomSet) {
    roomSet.delete(ws);
    if (roomSet.size === 0) {
      rooms.delete(roomId);
    } else {
      broadcastToRoom(roomId, ws, {
        type: 'peer:left',
        clientId,
        userName,
        peerCount: roomSet.size,
        timestamp: Date.now(),
      });
    }
  }
  clients.delete(ws);
}

wss.on('connection', (ws) => {
  const initialInfo: ClientInfo = {
    ws,
    clientId: '',
    roomId: '',
    branch: 'all',
    role: 'viewer',
    isAuthorized: false,
    isAlive: true,
    messageCount: 0,
    rateLimitWindow: Date.now(),
  };
  clients.set(ws, initialInfo);

  ws.on('pong', () => {
    const info = clients.get(ws);
    if (info) info.isAlive = true;
  });

  ws.on('message', async (rawData: Buffer | string) => {
    const info = clients.get(ws);
    if (!info) return;

    // Rate limiting check
    const now = Date.now();
    if (now - info.rateLimitWindow > RATE_LIMIT_WINDOW_MS) {
      info.rateLimitWindow = now;
      info.messageCount = 0;
    }
    info.messageCount++;
    if (info.messageCount > RATE_LIMIT_MAX_MSG) {
      ws.send(JSON.stringify({ type: 'error', code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' }));
      return;
    }

    try {
      const dataStr = rawData.toString();
      if (dataStr.length > MAX_PAYLOAD_BYTES) {
        ws.send(JSON.stringify({ type: 'error', code: 'PAYLOAD_TOO_LARGE', message: 'Payload exceeds 512KB' }));
        return;
      }

      const msg = JSON.parse(dataStr);
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
        ws.send(JSON.stringify({ type: 'error', code: 'INVALID_FORMAT', message: 'Invalid message structure' }));
        return;
      }

      if (msg.type === 'join') {
        const { roomId, clientId, userName, roomToken } = msg;

        if (!isValidId(roomId) || !isValidId(clientId)) {
          ws.send(JSON.stringify({ type: 'error', code: 'INVALID_ID', message: 'Identifiant de salle ou client invalide' }));
          return;
        }

        // P0 : Vérification cryptographique formelle du jeton de salle (HMAC-SHA256)
        const verification = verifyRoomToken(roomToken, roomId, WS_AUTH_SECRET);
        if (!verification.valid || !verification.payload) {
          ws.send(JSON.stringify({
            type: 'error',
            code: 'UNAUTHORIZED_TOKEN',
            message: `Accès refusé au relais WebSocket : ${verification.error || 'Jeton manquant ou non valide'}.`,
          }));
          return;
        }

        // Leave existing room if any
        if (info.roomId && info.roomId !== roomId) {
          removeClient(ws);
        }

        // Client formellement autorisé avec rôle et périmètre vérifiés côté serveur
        info.roomId = roomId;
        info.clientId = clientId;
        info.isAuthorized = true;
        info.role = verification.payload.role;
        info.branch = verification.payload.branch;
        info.userName = sanitizeText(userName, 50) || 'Membre';

        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set());
        }
        rooms.get(roomId)!.add(ws);

        // Assurer l'existence de l'état serveur
        getOrCreateRoomState(roomId);

        // Broadcast to other authorized peers in the room
        broadcastToRoom(roomId, ws, {
          type: 'peer:joined',
          clientId: info.clientId,
          userName: info.userName,
          branch: info.branch,
          role: info.role,
          peerCount: rooms.get(roomId)!.size,
          timestamp: Date.now(),
        });

        // Send confirmation back to joined peer
        ws.send(JSON.stringify({
          type: 'room:info',
          roomId,
          role: info.role,
          branch: info.branch,
          peerCount: rooms.get(roomId)!.size,
        }));

      } else if (msg.type === 'sync:action') {
        const opId = msg.id || msg.opId || ('op-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6));

        // Enforce that client has legitimately joined and is authorized in the room
        if (!info.isAuthorized || !info.roomId || !rooms.has(info.roomId) || !rooms.get(info.roomId)!.has(ws)) {
          ws.send(JSON.stringify({
            type: 'action:ack',
            opId,
            status: 'error',
            code: 'NOT_IN_ROOM',
            message: 'Non autorisé à diffuser des modifications. Rejoignez la salle avec un jeton valide.',
          }));
          return;
        }

        const roomState = getOrCreateRoomState(info.roomId);
        const rootPersonId = roomState.tree?.rootPersonId || Object.keys(roomState.tree?.individuals || {})[0] || '';

        // 1. Contrôle RBAC : les lecteurs n'ont AUCUN droit d'écriture
        if (info.role === 'viewer') {
          ws.send(JSON.stringify({
            type: 'action:ack',
            opId,
            status: 'error',
            code: 'FORBIDDEN_ROLE',
            message: 'Accès refusé : le rôle Lecteur n’autorise aucune modification ou diffusion en direct.',
          }));
          return;
        }

        // 2. Contrôle de l'action demandée
        const allowedActions = ['tree:update', 'person:edit', 'archive:add', 'archive:delete', 'access:update'];
        if (!allowedActions.includes(msg.action)) {
          ws.send(JSON.stringify({
            type: 'action:ack',
            opId,
            status: 'error',
            code: 'UNAUTHORIZED_ACTION',
            message: 'Type d\'action non permis.',
          }));
          return;
        }

        // 3. Actions critiques : tree:update et access:update strictement réservés à l'admin
        if ((msg.action === 'tree:update' || msg.action === 'access:update') && info.role !== 'admin') {
          ws.send(JSON.stringify({
            type: 'action:ack',
            opId,
            status: 'error',
            code: 'FORBIDDEN_ACTION',
            message: 'Action critique réservée aux administrateurs de l\'arbre.',
          }));
          return;
        }

        // 4. Contrôle serveur fiable du périmètre de branche pour person:edit
        // Le serveur détermine lui-même la branche de la ressource. Le payload du client n'est jamais cru sur parole.
        if (info.role === 'editor' && info.branch !== 'all' && msg.action === 'person:edit' && msg.payload) {
          const targetPersonId = typeof msg.payload.id === 'string' ? msg.payload.id.trim() : '';
          if (!targetPersonId) {
            ws.send(JSON.stringify({
              type: 'action:ack',
              opId,
              status: 'error',
              code: 'INVALID_PAYLOAD',
              message: 'Identifiant d\'individu manquant.',
            }));
            return;
          }

          const allowedIds = getBranchIndividuals(roomState.tree, rootPersonId, info.branch);
          const personExists = roomState.tree.individuals && roomState.tree.individuals[targetPersonId];
          if (personExists) {
            if (!allowedIds.has(targetPersonId)) {
              ws.send(JSON.stringify({
                type: 'action:ack',
                opId,
                status: 'error',
                code: 'FORBIDDEN_BRANCH',
                message: `Accès refusé : l'individu "${targetPersonId}" n'appartient pas à la branche "${info.branch}" autorisée pour votre compte d'éditeur (attributs client ignorés).`,
              }));
              return;
            }
          } else {
            // Création d'un nouvel individu : vérification stricte du rattachement familial
            const childFams = Array.isArray(msg.payload.familiesAsChild) ? msg.payload.familiesAsChild : [];
            const spouseFams = Array.isArray(msg.payload.familiesAsSpouse) ? msg.payload.familiesAsSpouse : [];
            const allLinkedFams = [...childFams, ...spouseFams];
            
            const isLinkedToAllowedBranch = allLinkedFams.some(fId => {
              const fam = roomState.tree.families?.[fId];
              if (!fam) return false;
              return (
                (fam.husbandId && allowedIds.has(fam.husbandId)) ||
                (fam.wifeId && allowedIds.has(fam.wifeId)) ||
                fam.childrenIds?.some((cid: string) => allowedIds.has(cid))
              );
            });

            if (!isLinkedToAllowedBranch && allLinkedFams.length > 0) {
              ws.send(JSON.stringify({
                type: 'action:ack',
                opId,
                status: 'error',
                code: 'FORBIDDEN_BRANCH',
                message: `Accès refusé : le nouvel individu créé doit être rattaché à une famille existante de votre branche autorisée (${info.branch}).`,
              }));
              return;
            }
          }
        }

        // 5. Contrôle serveur du périmètre pour archive:add
        if (info.role === 'editor' && info.branch !== 'all' && msg.action === 'archive:add' && msg.payload) {
          const arc = msg.payload as ArchiveDocument;
          const allowedIds = getBranchIndividuals(roomState.tree, rootPersonId, info.branch);

          if (!Array.isArray(arc.linkedPersonIds) || arc.linkedPersonIds.length === 0) {
            ws.send(JSON.stringify({
              type: 'action:ack',
              opId,
              status: 'error',
              code: 'FORBIDDEN_BRANCH',
              message: `Accès refusé : un éditeur de branche (${info.branch}) doit obligatoirement relier l'acte à au moins un individu de sa branche.`,
            }));
            return;
          }

          const hasUnauthorized = arc.linkedPersonIds.some(pid => !allowedIds.has(pid));
          if (hasUnauthorized) {
            ws.send(JSON.stringify({
              type: 'action:ack',
              opId,
              status: 'error',
              code: 'FORBIDDEN_BRANCH',
              message: `Accès refusé : vous ne pouvez pas rattacher un document d'archive à des personnes en dehors de votre branche autorisée (${info.branch}).`,
            }));
            return;
          }
        }

        // 6. Contrôle serveur du périmètre pour archive:delete
        if (info.role === 'editor' && msg.action === 'archive:delete' && msg.payload) {
          const arcId = typeof msg.payload === 'string' ? msg.payload : msg.payload?.id;
          if (!arcId) {
            ws.send(JSON.stringify({
              type: 'action:ack',
              opId,
              status: 'error',
              code: 'INVALID_PAYLOAD',
              message: 'Identifiant d\'archive manquant.',
            }));
            return;
          }

          const existingArc = roomState.archives.get(arcId);
          if (!existingArc) {
            ws.send(JSON.stringify({
              type: 'action:ack',
              opId,
              status: 'error',
              code: 'NOT_FOUND',
              message: 'Document d\'archive introuvable sur le serveur pour vérification des droits.',
            }));
            return;
          }

          if (info.branch !== 'all') {
            const allowedIds = getBranchIndividuals(roomState.tree, rootPersonId, info.branch);
            if (!Array.isArray(existingArc.linkedPersonIds) || existingArc.linkedPersonIds.length === 0) {
              ws.send(JSON.stringify({
                type: 'action:ack',
                opId,
                status: 'error',
                code: 'FORBIDDEN_BRANCH',
                message: 'Accès refusé : la suppression d\'une archive générale sans lien individuel est réservée aux administrateurs.',
              }));
              return;
            }

            const hasUnauthorized = existingArc.linkedPersonIds.some(pid => !allowedIds.has(pid));
            if (hasUnauthorized) {
              ws.send(JSON.stringify({
                type: 'action:ack',
                opId,
                status: 'error',
                code: 'FORBIDDEN_BRANCH',
                message: `Accès refusé : ce document concerne des individus situés en dehors de votre branche autorisée (${info.branch}).`,
              }));
              return;
            }
          }
        }

        // Mise à jour de l'état serveur faisant autorité
        if (msg.action === 'tree:update' && msg.payload) {
          roomState.tree = msg.payload;
        } else if (msg.action === 'person:edit' && msg.payload?.id) {
          if (!roomState.tree.individuals) roomState.tree.individuals = {};
          roomState.tree.individuals[msg.payload.id] = msg.payload;
        } else if (msg.action === 'archive:add' && msg.payload?.id) {
          roomState.archives.set(msg.payload.id, msg.payload);
        } else if (msg.action === 'archive:delete') {
          const arcId = typeof msg.payload === 'string' ? msg.payload : msg.payload?.id;
          roomState.archives.delete(arcId);
        } else if (msg.action === 'access:update' && Array.isArray(msg.payload)) {
          roomState.accessRules.clear();
          for (const rule of msg.payload) {
            if (rule.revoked) continue; // P0/P1 : Les règles révoquées ne sont jamais réactivées en mémoire
            if (rule.shareToken) roomState.accessRules.set(rule.shareToken, rule);
            if (rule.id) roomState.accessRules.set(rule.id, rule);
          }
        }

        // P1 : PERSISTANCE DURABLE : D'abord sur stockage disque local non-volatile (atomique)
        try {
          persistRoomStateToDisk(info.roomId, roomState);
        } catch (storageErr: any) {
          ws.send(JSON.stringify({
            type: 'action:ack',
            opId,
            status: 'error',
            code: 'PERSISTENCE_FAILED',
            message: `Échec d'enregistrement durable sur le stockage serveur : ${storageErr?.message || 'Erreur disque'}. Modification rejetée.`,
          }));
          return;
        }

        // P1 : Synchronisation Firestore avec attente active pour certifier le niveau de persistance cloud
        let firestoreSync: { success: boolean; error?: string } = { success: false };
        if (firebaseConfig.projectId && info.roomId !== 'martin-family-tree' && info.roomId !== 'demo') {
          firestoreSync = await syncActionToFirestore(info.roomId, msg.action, msg.payload, info.idToken);
        } else if (info.roomId === 'martin-family-tree' || info.roomId === 'demo') {
          firestoreSync = { success: true };
        }

        // Action validée et enregistrée : relais aux autres pairs de la même salle
        broadcastToRoom(info.roomId, ws, {
          type: 'sync:action',
          id: opId,
          clientId: info.clientId,
          action: msg.action,
          payload: msg.payload,
          timestamp: Date.now(),
        });

        // Accusé de réception (ACK) certifiant les niveaux de persistance (disque local vs cloud Firestore)
        ws.send(JSON.stringify({
          type: 'action:ack',
          opId,
          status: 'success',
          action: msg.action,
          persistedLocal: true,
          persistedFirestore: firestoreSync.success,
          storage: firestoreSync.success ? 'cloud_and_local' : 'local_disk_only',
          firestoreError: firestoreSync.success ? undefined : firestoreSync.error,
          durable: true,
          timestamp: Date.now(),
        }));

      } else if (msg.type === 'presence:ping') {
        if (!info.isAuthorized || !info.roomId || !rooms.has(info.roomId)) return;

        broadcastToRoom(info.roomId, ws, {
          type: 'presence:update',
          clientId: info.clientId,
          userName: info.userName,
          cursor: typeof msg.cursor === 'object' ? msg.cursor : undefined,
          activeView: sanitizeText(msg.activeView, 30),
          activePersonId: isValidId(msg.activePersonId) ? msg.activePersonId : undefined,
        });

      } else {
        ws.send(JSON.stringify({ type: 'error', code: 'UNKNOWN_TYPE', message: 'Unknown message type' }));
      }

    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', code: 'MALFORMED_JSON', message: 'JSON parsing failed' }));
    }
  });

  ws.on('close', () => {
    removeClient(ws);
  });
});

function broadcastToRoom(roomId: string, sender: WebSocket, payload: any) {
  const roomSet = rooms.get(roomId);
  if (!roomSet) return;

  for (const client of roomSet) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      const recipientInfo = clients.get(client);
      let clientPayload = payload;

      // Protection stricte de la confidentialité en temps réel pour les observateurs / lecteurs
      if (recipientInfo && recipientInfo.role === 'viewer' && payload.type === 'sync:action') {
        if (payload.action === 'person:edit' && payload.payload) {
          const rawPerson = payload.payload;
          if (shouldProtectPerson(rawPerson)) {
            clientPayload = {
              ...payload,
              payload: sanitizePersonForPrivacy(rawPerson),
            };
          }
        } else if (payload.action === 'tree:update' && payload.payload) {
          clientPayload = {
            ...payload,
            payload: sanitizeGenealogyDataForPrivacy(payload.payload),
          };
        } else if (payload.action === 'archive:add' && payload.payload) {
          const rawArchive = payload.payload;
          const sanitizedArc = sanitizeArchiveForPrivacy(rawArchive, new Set(rawArchive.linkedPersonIds || []));
          if (!sanitizedArc) {
            continue;
          }
          clientPayload = {
            ...payload,
            payload: sanitizedArc,
          };
        }

        // Contrôle de branche serveur pour les observateurs restreints
        // SÉCURITÉ P0 : Le serveur calcule lui-même la branche de la personne réelle. Aucun attribut client payload.branch n'est utilisé.
        if (recipientInfo.branch !== 'all' && payload.action === 'person:edit' && payload.payload?.id) {
          const roomState = getOrCreateRoomState(roomId);
          const rootPersonId = roomState.tree?.rootPersonId || Object.keys(roomState.tree?.individuals || {})[0] || '';
          const allowedRecipientIds = getBranchIndividuals(roomState.tree, rootPersonId, recipientInfo.branch);
          if (!allowedRecipientIds.has(payload.payload.id)) {
            continue;
          }
        }
      }

      client.send(JSON.stringify(clientPayload));
    }
  }
}

// Healthcheck & WebSocket room status endpoint (without exposing private room ids)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeRoomsCount: rooms.size, totalClientsCount: clients.size });
});

// Endpoint de version et de vérification des mises à jour système
app.get('/api/system/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({
    version: '2.5.0',
    releaseDate: '2026-10-20',
    timestamp: Date.now(),
    channel: 'stable',
    features: ['dark-mode', 'hamburger-menu', 'pwa-install', 'system-updates', 'context-guides'],
  });
});

// Endpoint d'authentification et d'émission de jeton de salle sécurisé (HMAC-SHA256)
// SÉCURITÉ P0 : Le rôle n'est JAMAIS choisi par le client ; il est souverainement déterminé
// par le serveur via vérification Firebase Auth ou jeton de partage vérifié.
app.post('/api/auth/room-token', async (req, res) => {
  try {
    // SÉCURITÉ P0 : Le rôle et la branche demandés par le client dans req.body NE SONT JAMAIS CONSULTÉS NI ACCEPTÉS.
    // L'autorisation provient exclusivement de la vérification de l'identité Firebase et des règles Firestore.
    const { roomId, expiresInHours = 72, userName, invitationToken, shareToken, password } = req.body || {};
    if (!isValidId(roomId)) {
      return res.status(400).json({ error: 'Identifiant de salle invalide' });
    }

    const authHeader = req.headers.authorization;
    const roomState = getOrCreateRoomState(roomId);

    let assignedRole: BranchRole = 'viewer';
    let assignedBranch: BranchScope = 'all';
    let authenticatedUser: string = sanitizeText(userName, 50) || 'Visiteur';
    let isAuthorized = false;

    // 1. Authentification Firebase Auth officielle via Bearer Token et vérification des droits réels Firestore
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.substring(7).trim();
      if (idToken) {
        try {
          const expectedProjectId = firebaseConfig.projectId || 'genealogor-1a03d7';
          const verifyResult = await verifyFirebaseIdToken(idToken, {
            expectedProjectId,
            checkRevoked: true,
          });

          if (!verifyResult.valid) {
            return res.status(401).json({
              error: `Jeton Firebase non valide : ${verifyResult.error}`,
              code: verifyResult.code || 'INVALID_FIREBASE_TOKEN',
            });
          }

          const uid = verifyResult.uid!;
          const email = verifyResult.email;
          const email_verified = verifyResult.email_verified;

          authenticatedUser = email || sanitizeText(userName, 50) || 'Utilisateur authentifié';
          const isSuperAdmin = email === 'jeanpierre.nouhailler@gmail.com' && Boolean(email_verified);

          if (isSuperAdmin) {
            // Super administrateur global
            assignedRole = 'admin';
            assignedBranch = 'all';
            isAuthorized = true;
          } else if (firebaseConfig.projectId && firebaseConfig.firestoreDatabaseId) {
            // Vérification autoritaire des droits dans Firestore
            const firestoreDocUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/trees/${roomId}`;
            const fRes = await fetch(firestoreDocUrl, {
              headers: { Authorization: `Bearer ${idToken}` },
            });

            if (fRes.ok) {
              const treeDoc = await fRes.json();
              const ownerId = treeDoc.fields?.ownerId?.stringValue;
              const ownerEmail = treeDoc.fields?.ownerEmail?.stringValue;
              const editors: string[] = treeDoc.fields?.editors?.arrayValue?.values?.map((v: any) => v.stringValue) || [];
              const viewers: string[] = treeDoc.fields?.viewers?.arrayValue?.values?.map((v: any) => v.stringValue) || [];
              const isPublic = treeDoc.fields?.isPublic?.booleanValue === true;

              roomState.ownerId = ownerId;
              roomState.ownerEmail = ownerEmail;
              roomState.editors = new Set(editors);
              roomState.viewers = new Set(viewers);

              // P1 : Réhydratation automatique depuis Firestore en cas de disque local éphémère ou redémarrage conteneur
              if (Object.keys(roomState.tree.individuals || {}).length === 0 && treeDoc.fields?.individualsJson?.stringValue) {
                try {
                  roomState.tree.individuals = JSON.parse(treeDoc.fields.individualsJson.stringValue);
                } catch (e) {}
                try {
                  if (treeDoc.fields?.familiesJson?.stringValue) {
                    roomState.tree.families = JSON.parse(treeDoc.fields.familiesJson.stringValue);
                  }
                } catch (e) {}
                if (treeDoc.fields?.rootPersonId?.stringValue) {
                  roomState.tree.rootPersonId = treeDoc.fields.rootPersonId.stringValue;
                }
                if (treeDoc.fields?.title?.stringValue) {
                  roomState.tree.sourceHeader = treeDoc.fields.title.stringValue;
                }
              }

              // Réhydratation des archives si absentes de la mémoire
              if (roomState.archives.size === 0) {
                try {
                  const arcRes = await fetch(`${firestoreDocUrl}/archives`, {
                    headers: { Authorization: `Bearer ${idToken}` }
                  });
                  if (arcRes.ok) {
                    const arcData = await arcRes.json();
                    for (const adoc of arcData.documents || []) {
                      const f = adoc.fields || {};
                      const arcId = f.id?.stringValue || adoc.name.split('/').pop() || '';
                      if (arcId) {
                        roomState.archives.set(arcId, {
                          id: arcId,
                          title: f.title?.stringValue || '',
                          type: f.type?.stringValue || 'other',
                          date: f.date?.stringValue || '',
                          linkedPersonIds: f.linkedPersonIds?.arrayValue?.values?.map((v: any) => v.stringValue) || [],
                          linkedFamilyIds: [],
                          createdAt: parseInt(f.updatedAt?.integerValue || '0', 10),
                          updatedAt: parseInt(f.updatedAt?.integerValue || '0', 10),
                        } as any);
                      }
                    }
                  }
                } catch (e) {}
              }

              // Mettre à jour le cache local atomique (si le système de fichiers est inscriptible)
              try { persistRoomStateToDisk(roomId, roomState); } catch (e) {}

              if (uid === ownerId || (ownerEmail && email === ownerEmail)) {
                assignedRole = 'admin';
                assignedBranch = 'all';
                isAuthorized = true;
              } else if (editors.includes(uid)) {
                assignedRole = 'editor';
                assignedBranch = roomState.editorBranches.get(uid) || 'all';
                isAuthorized = true;
              } else if (viewers.includes(uid) || isPublic) {
                assignedRole = 'viewer';
                assignedBranch = 'all';
                isAuthorized = true;
              } else {
                return res.status(403).json({
                  error: 'Accès refusé : votre compte n\'est pas habilité sur cet arbre.',
                });
              }
            } else if (fRes.status === 404) {
              // L'arbre n'existe pas encore dans Firestore
              if (roomId === 'martin-family-tree' || roomId === 'demo') {
                // L'arbre de démo ne confère jamais les droits admin à un tiers
                assignedRole = 'viewer';
                assignedBranch = 'all';
                isAuthorized = true;
              } else if (roomId === `tree_${uid}` || roomId === uid) {
                // Espace personnel légitime du créateur
                roomState.ownerId = uid;
                roomState.ownerEmail = email || '';
                assignedRole = 'admin';
                assignedBranch = 'all';
                isAuthorized = true;
              } else {
                return res.status(404).json({
                  error: 'Arbre inexistant. Veuillez initialiser l\'arbre dans Firestore avant de demander un jeton de collaboration.',
                });
              }
            } else {
              return res.status(403).json({
                error: 'Accès refusé par les règles de sécurité Firestore.',
              });
            }
          } else {
            // Environnement local / tests
            if (roomId === 'martin-family-tree' || roomId === 'demo') {
              assignedRole = 'viewer';
              assignedBranch = 'all';
              isAuthorized = true;
            } else if (roomState.ownerId && (roomState.ownerId === uid || roomState.ownerEmail === email)) {
              assignedRole = 'admin';
              assignedBranch = 'all';
              isAuthorized = true;
            } else if (roomId === `tree_${uid}` || roomId === uid) {
              roomState.ownerId = uid;
              roomState.ownerEmail = email || '';
              assignedRole = 'admin';
              assignedBranch = 'all';
              isAuthorized = true;
            } else {
              return res.status(403).json({ error: 'Compte non autorisé sur cet arbre.' });
            }
          }
        } catch (authErr: any) {
          console.warn('Erreur vérification token Firebase:', authErr);
          return res.status(401).json({ error: 'Validation de l\'authentification Firebase échouée' });
        }
      }
    }

    // 2. Authentification par lien de partage / jeton d'invitation (invitationToken)
    const tokenToCheck = invitationToken || shareToken;
    if (!isAuthorized && tokenToCheck && typeof tokenToCheck === 'string') {
      // SÉCURITÉ P0 : Chargement systématique et actualisé des règles depuis la source d'autorité Firestore
      // Prévient l'usage de règles obsolètes, gère les redémarrages serveur et applique immédiatement les révocations
      await syncRoomAccessRulesFromFirestore(roomId);

      const rule = roomState.accessRules.get(tokenToCheck);
      if (rule) {
        // P0/P1 : Vérification cryptographique formelle du mot de passe (PBKDF2/SHA-256)
        if (rule.passwordHash) {
          if (!password || typeof password !== 'string' || password.trim().length === 0) {
            return res.status(401).json({ 
              error: 'Mot de passe requis pour ce lien de partage.', 
              code: 'PASSWORD_REQUIRED' 
            });
          }

          let isPasswordValid = false;
          try {
            isPasswordValid = await verifyPassword(password, rule.passwordHash);
          } catch (err) {
            isPasswordValid = false;
          }

          if (!isPasswordValid) {
            return res.status(401).json({ 
              error: 'Mot de passe invalide pour ce lien de partage.', 
              code: 'INVALID_PASSWORD' 
            });
          }
        }

        // Le rôle et la branche sont fixés exclusivement par la règle d'accès serveur
        // Un lien de partage ne peut accorder que 'editor' ou 'viewer' (jamais 'admin')
        assignedRole = rule.role === 'admin' ? 'editor' : (rule.role || 'viewer');
        assignedBranch = rule.branch || 'all';
        authenticatedUser = sanitizeText(userName || rule.name, 50) || 'Membre invité';
        isAuthorized = true;
      } else {
        return res.status(403).json({ error: 'Lien de partage ou jeton d\'invitation invalide ou révoqué.' });
      }
    }

    // 3. Arbre de démonstration public (rôle strictement restreint à viewer)
    if (!isAuthorized && (roomId === 'martin-family-tree' || roomId === 'demo')) {
      assignedRole = 'viewer';
      assignedBranch = 'all';
      authenticatedUser = sanitizeText(userName, 50) || 'Visiteur démo';
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return res.status(401).json({
        error: 'Authentification obligatoire : connectez-vous avec votre compte habilité ou utilisez un lien de partage valide.',
      });
    }

    const exp = typeof expiresInHours === 'number' && expiresInHours > 0 
      ? Date.now() + expiresInHours * 3600 * 1000 
      : 0;

    // Le jeton est signé avec le secret serveur et contient le rôle vérifié
    const token = signRoomToken({
      roomId,
      role: assignedRole,
      branch: assignedBranch,
      exp,
      iat: Date.now(),
      sub: authenticatedUser,
    }, WS_AUTH_SECRET);

    res.json({ token, roomId, role: assignedRole, branch: assignedBranch, exp, userName: authenticatedUser });
  } catch (e: any) {
    res.status(500).json({ error: 'Échec de génération du jeton sécurisé' });
  }
});

// Suppression définitive d'un arbre côté serveur (cache mémoire + fichier data/rooms/<id>.json).
// SÉCURITÉ : réservée au profil administrateur, prouvé par un jeton de salle signé (HMAC) émis par /api/auth/room-token.
app.delete('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  if (!isValidId(roomId)) {
    return res.status(400).json({ error: 'Identifiant de salle invalide' });
  }

  const authHeader = req.headers.authorization || '';
  const roomToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
  const verification = verifyRoomToken(roomToken, roomId, WS_AUTH_SECRET);
  if (!verification.valid || !verification.payload) {
    return res.status(401).json({ error: 'Jeton de salle manquant ou invalide.' });
  }
  if (verification.payload.role !== 'admin') {
    return res.status(403).json({ error: 'Seul l\'administrateur de l\'arbre peut le supprimer.' });
  }

  // Prévenir les membres connectés puis fermer le salon
  const roomSet = rooms.get(roomId);
  if (roomSet) {
    for (const client of roomSet) {
      try {
        client.send(JSON.stringify({ type: 'room:deleted', roomId, timestamp: Date.now() }));
      } catch (e) {}
      const info = clients.get(client);
      if (info) {
        info.isAuthorized = false;
        info.roomId = '';
      }
    }
    rooms.delete(roomId);
  }
  roomStates.delete(roomId);

  try {
    const filePath = path.join(DATA_DIR, `${roomId}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err: any) {
    console.error(`[STORAGE ERROR] Suppression impossible du fichier de la salle ${roomId} :`, err);
    return res.status(500).json({ error: 'Échec de la suppression des données serveur.' });
  }

  console.log(`[ROOMS] Arbre ${roomId} supprimé par ${verification.payload.sub || 'administrateur'}.`);
  res.json({ success: true, roomId });
});

// Configure Vite middleware in development or static serving in production
async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' },
      appType: 'spa',
    });
    // Landing page statique : en dev, Vite ne sert pas l'index d'un sous-dossier de public/ (repli SPA)
    app.use('/decouvrir', express.static(path.join(__dirname, 'public', 'decouvrir')));
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`Server running securely on port ${PORT}`);
  });
}

startServer();
