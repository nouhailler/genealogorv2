/**
 * Module d'authentification et de validation cryptographique des jetons de salle WebSocket.
 * Implémente la signature et vérification HMAC-SHA256 conforme aux standards JWT.
 * SÉCURITÉ P0 : Le secret HMAC DOIT être fourni par l'environnement et ne jamais
 * comporter de valeur par défaut prévisible écrite en clair dans le code.
 */

import { BranchRole, BranchScope } from '../types/genealogy';

export interface RoomTokenPayload {
  roomId: string;
  role: BranchRole;
  branch: BranchScope;
  exp: number; // 0 = illimité, ou timestamp UNIX en millisecondes
  iat: number; // Timestamp d'émission
  sub?: string; // Nom ou identifiant de l'utilisateur
  nonce?: string;
}

/**
 * Encode une chaîne en Base64URL sécurisé (sans +, /, =)
 */
export function base64UrlEncode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64url');
  }
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Décode une chaîne Base64URL
 */
export function base64UrlDecode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64url').toString('utf8');
  }
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

import * as nodeCrypto from 'crypto';

/**
 * Calcule une signature cryptographique HMAC-SHA256 formelle.
 * Aucun fallback non-cryptographique n'est toléré.
 */
export function computeHmacSha256Sync(data: string, secret: string): string {
  if (!secret || typeof secret !== 'string' || secret.trim().length === 0) {
    throw new Error('Secret cryptographique manquant ou vide pour la signature HMAC-SHA256.');
  }

  // Node.js, Bun ou runtime moderne
  try {
    if (nodeCrypto && typeof nodeCrypto.createHmac === 'function') {
      return nodeCrypto.createHmac('sha256', secret).update(data).digest('base64url');
    }
  } catch (e) {}

  try {
    const cryptoObj = (globalThis as any).crypto || (typeof require !== 'undefined' ? require('crypto') : null);
    if (cryptoObj && typeof cryptoObj.createHmac === 'function') {
      return cryptoObj.createHmac('sha256', secret).update(data).digest('base64url');
    }
  } catch (e) {}

  throw new Error('Module cryptographique HMAC-SHA256 indisponible dans cet environnement.');
}

/**
 * Génère un secret cryptographiquement robuste (256 bits aléatoires)
 */
export function generateEphemeralSecret(): string {
  try {
    if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') {
      return nodeCrypto.randomBytes(32).toString('hex');
    }
  } catch (e) {}

  try {
    const cryptoObj = (globalThis as any).crypto || (typeof require !== 'undefined' ? require('crypto') : null);
    if (cryptoObj && typeof cryptoObj.randomBytes === 'function') {
      return cryptoObj.randomBytes(32).toString('hex');
    }
    if (cryptoObj && cryptoObj.getRandomValues) {
      const bytes = new Uint8Array(32);
      cryptoObj.getRandomValues(bytes);
      return Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}

  throw new Error('Générateur aléatoire cryptographique sécurisé non disponible.');
}

/**
 * Signe un jeton de salle avec son rôle, périmètre de branche et durée de validité.
 * Exige impérativement un secret HMAC non vide.
 */
export function signRoomToken(payload: RoomTokenPayload, secret: string): string {
  if (!secret || secret.trim().length === 0) {
    throw new Error('Signature impossible : secret HMAC obligatoire.');
  }
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = computeHmacSha256Sync(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

/**
 * Vérifie l'intégrité, la signature, la salle cible, le rôle et l'expiration du jeton.
 */
export function verifyRoomToken(
  token: unknown,
  expectedRoomId: string,
  secret: string
): {
  valid: boolean;
  payload?: RoomTokenPayload;
  error?: string;
  code?: 'MISSING_TOKEN' | 'INVALID_FORMAT' | 'INVALID_SIGNATURE' | 'WRONG_ROOM' | 'EXPIRED_TOKEN';
} {
  if (!secret || secret.trim().length === 0) {
    return { valid: false, error: 'Secret de validation HMAC non configuré', code: 'INVALID_SIGNATURE' };
  }

  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Jeton de salle absent ou non fourni', code: 'MISSING_TOKEN' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Structure de jeton invalide (3 segments requis)', code: 'INVALID_FORMAT' };
  }

  const [header, body, signature] = parts;
  let expectedSig: string;
  try {
    expectedSig = computeHmacSha256Sync(`${header}.${body}`, secret);
  } catch (err: any) {
    return { valid: false, error: 'Échec du calcul HMAC de vérification', code: 'INVALID_SIGNATURE' };
  }

  if (signature !== expectedSig) {
    return { valid: false, error: 'Signature cryptographique invalide : jeton altéré ou falsifié', code: 'INVALID_SIGNATURE' };
  }

  try {
    const payloadStr = base64UrlDecode(body);
    const payload: RoomTokenPayload = JSON.parse(payloadStr);

    if (!payload || typeof payload !== 'object') {
      return { valid: false, error: 'Payload de jeton malformé', code: 'INVALID_FORMAT' };
    }

    if (payload.roomId !== expectedRoomId) {
      return { 
        valid: false, 
        error: `Jeton non autorisé pour la salle ${expectedRoomId} (délivré pour ${payload.roomId})`, 
        code: 'WRONG_ROOM' 
      };
    }

    if (payload.exp > 0 && Date.now() > payload.exp) {
      return { valid: false, error: 'Jeton de salle expiré', code: 'EXPIRED_TOKEN' };
    }

    // Validation du rôle et de la branche
    const validRoles: BranchRole[] = ['admin', 'editor', 'viewer'];
    const validBranches: BranchScope[] = ['all', 'paternal', 'maternal', 'custom'];

    if (!validRoles.includes(payload.role)) {
      payload.role = 'viewer';
    }
    if (!validBranches.includes(payload.branch)) {
      payload.branch = 'all';
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: 'Impossible de décoder les attributs du jeton', code: 'INVALID_FORMAT' };
  }
}

/**
 * Liste des secrets par défaut ou triviaux strictement bannis.
 */
export const FORBIDDEN_SECRETS = new Set([
  'default-secret',
  'genealogor-secret-key-2026',
  'secret',
  'changeme',
  'supersecret',
  '12345678',
  'password',
  'admin',
  'ws_secret',
  'default_ws_secret',
  'default',
  'test',
]);

/**
 * Valide et résout le secret d'authentification HMAC.
 * En production : impose obligatoirement un secret robuste (min 32 caractères, non trivial).
 * Si absent ou non conforme en production : lève une exception fatale pour stopper le démarrage du serveur.
 * En environnement local / test : génère un secret aléatoire fort de 256 bits si aucun secret n'est fourni.
 */
export function resolveWsAuthSecret(customSecret?: string, isProd: boolean = process.env.NODE_ENV === 'production'): string {
  const candidate = (customSecret !== undefined ? customSecret : process.env.WS_AUTH_SECRET)?.trim();

  if (!candidate || candidate.length < 32 || FORBIDDEN_SECRETS.has(candidate.toLowerCase())) {
    if (isProd) {
      throw new Error(
        '[FATAL CRITICAL SECURITY ERROR] La variable d\'environnement WS_AUTH_SECRET est obligatoire en production, ' +
        'doit comporter au moins 32 caractères cryptographiques et ne peut pas être un secret par défaut connu.'
      );
    }
    return generateEphemeralSecret();
  }

  return candidate;
}
