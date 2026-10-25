/**
 * Partage d'arbre par lien secret, compatible hébergement statique (Cloudflare).
 *
 * Le créateur publie dans Firestore (`/shares/{jeton}`) un instantané en lecture seule de l'arbre,
 * filtré par branche et anonymisé si demandé, compressé (gzip) puis chiffré (AES-GCM 256).
 *  - Sans mot de passe : la clé de déchiffrement voyage dans le fragment d'URL (`#k=...`),
 *    jamais transmis aux serveurs.
 *  - Avec mot de passe : la clé est stockée chiffrée par le mot de passe (`wrappedKey`).
 * Le jeton (128 bits aléatoires) sert d'identifiant de document : sans lui, l'instantané est introuvable.
 */

import { ArchiveDocument, BranchAccess, GenealogyData } from '../types/genealogy';
import { filterGenealogyData } from './branch-filter';
import { getProtectedPersonIds, sanitizeArchivesForPrivacy } from './privacy';
import { decryptData, encryptData } from './crypto';
import { ChangeEvent, filterChangesForShare } from './change-log';

export const SHARE_FORMAT_VERSION = 1;
/** Marge sous la limite de 1 Mio d'un document Firestore */
export const MAX_SHARE_PAYLOAD_CHARS = 900_000;

export interface ShareSnapshot {
  version: number;
  title: string;
  branch: BranchAccess['branch'];
  shareName: string;
  generatedAt: string;
  tree: GenealogyData;
  archives: ArchiveDocument[];
  /** Journal des modifications visibles par ce lien (alertes) */
  changes?: ChangeEvent[];
}

/** Document Firestore `/shares/{jeton}` */
export interface ShareDocument {
  version: number;
  treeId: string;
  ownerId: string;
  hasPassword: boolean;
  wrappedKey?: string;
  payload: string;
  updatedAt: string;
}

function randomBase64Url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Jeton de partage : 128 bits aléatoires, conforme à `^[a-zA-Z0-9_\-]+$` (règles Firestore) */
export function generateSecureShareToken(): string {
  return 'shr-' + randomBase64Url(16);
}

/** Clé de contenu de l'instantané : 256 bits aléatoires */
export function generateShareKey(): string {
  return randomBase64Url(32);
}

/** Lien moderne publié dans Firestore (par opposition aux anciens liens `inv-` vérifiés par le serveur Node) */
export function isFirestoreShare(access: BranchAccess): boolean {
  return Boolean(access.shareKey) && !access.revoked;
}

/**
 * Construit l'instantané visible par le destinataire : branche autorisée, vivants anonymisés si demandé,
 * archives sans les fichiers image (trop volumineux pour un document Firestore).
 */
export function buildShareSnapshot(
  data: GenealogyData,
  archives: ArchiveDocument[],
  access: BranchAccess,
  changeLog: ChangeEvent[] = []
): ShareSnapshot {
  const rootId = access.rootPersonId && data.individuals[access.rootPersonId]
    ? access.rootPersonId
    : data.rootPersonId || Object.keys(data.individuals)[0] || '';

  const tree = rootId
    ? filterGenealogyData(data, rootId, access.branch, access.hideLiving)
    : data;

  const allowedIds = new Set(Object.keys(tree.individuals));
  let visibleArchives = archives.filter(arc =>
    arc.linkedPersonIds.length === 0 || arc.linkedPersonIds.some(id => allowedIds.has(id))
  );
  if (access.hideLiving) {
    visibleArchives = sanitizeArchivesForPrivacy(visibleArchives, getProtectedPersonIds(data));
  }

  const sharedArchives = visibleArchives.map(({ fileData, ...rest }) => rest);
  return {
    version: SHARE_FORMAT_VERSION,
    title: data.sourceHeader || 'Arbre généalogique',
    branch: access.branch,
    shareName: access.name,
    generatedAt: new Date().toISOString(),
    tree: { ...tree, rootPersonId: tree.individuals[rootId] ? rootId : tree.rootPersonId },
    archives: sharedArchives,
    changes: filterChangesForShare(changeLog, tree, sharedArchives, access.hideLiving),
  };
}

async function gzipToBase64(text: string): Promise<string> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function gunzipFromBase64(b64: string): Promise<string> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Empreinte du contenu partagé (hors date de génération) pour éviter les republications inutiles */
export async function snapshotFingerprint(snapshot: ShareSnapshot): Promise<string> {
  const { generatedAt, ...content } = snapshot;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(content)));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Compresse puis chiffre l'instantané avec la clé de contenu */
export async function sealSnapshot(snapshot: ShareSnapshot, shareKey: string): Promise<string> {
  const compressed = await gzipToBase64(JSON.stringify(snapshot));
  const payload = await encryptData(compressed, shareKey);
  if (payload.length > MAX_SHARE_PAYLOAD_CHARS) {
    throw new Error('Arbre trop volumineux pour un lien de partage (limite Firestore de 1 Mo).');
  }
  return payload;
}

/** Déchiffre puis décompresse un instantané (lève une erreur si la clé est fausse ou les données altérées) */
export async function openSnapshot(payload: string, shareKey: string): Promise<ShareSnapshot> {
  const compressed = await decryptData(payload, shareKey);
  return JSON.parse(await gunzipFromBase64(compressed)) as ShareSnapshot;
}

export function wrapShareKey(shareKey: string, password: string): Promise<string> {
  return encryptData(shareKey, password);
}

export function unwrapShareKey(wrappedKey: string, password: string): Promise<string> {
  return decryptData(wrappedKey, password);
}

/** URL à envoyer : la clé n'est incluse (dans le fragment) que pour un lien sans mot de passe */
export function buildShareUrl(baseUrl: string, access: BranchAccess): string {
  const url = `${baseUrl}?share=${encodeURIComponent(access.shareToken)}`;
  return access.wrappedKey || !access.shareKey ? url : `${url}#k=${access.shareKey}`;
}

/** Lit `?share=...` et `#k=...` dans l'URL courante */
export function readShareParams(search: string, hash: string): { token: string; key: string } | null {
  const token = new URLSearchParams(search).get('share');
  if (!token || !/^[a-zA-Z0-9_\-]{8,128}$/.test(token)) return null;
  const key = new URLSearchParams(hash.replace(/^#/, '')).get('k') || '';
  return { token, key };
}

/** Retire la clé secrète avant toute diffusion de la liste des accès (relais temps réel) */
export function stripShareSecrets(list: BranchAccess[]): BranchAccess[] {
  return list.map(({ shareKey, ...rest }) => rest);
}
