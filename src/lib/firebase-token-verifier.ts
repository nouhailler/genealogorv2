/**
 * Module de vérification cryptographique des jetons d'authentification Firebase (ID Tokens).
 * Conforme aux spécifications officielles Firebase Authentication et Google Identity :
 * 1. Décodage et contrôle de l'en-tête (alg: RS256, kid présent).
 * 2. Vérification des assertions (claims) :
 *    - aud : Doit correspondre exactement au Project ID Firebase
 *    - iss : Doit correspondre à https://securetoken.google.com/<projectId>
 *    - sub : Identifiant unique de l'utilisateur (UID non vide)
 *    - exp : Date d'expiration (rejet des jetons expirés)
 *    - iat : Date d'émission antérieure à maintenant
 *    - auth_time : Heure d'authentification antérieure à maintenant
 *    - révocation : Vérification de révocation par rapport au timestamp de révocation
 * 3. Validation de la signature cryptographique RS256 via les certificats publics Google
 *    (https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com).
 */

import crypto from 'crypto';

export interface FirebaseIdTokenPayload {
  iss: string;
  aud: string;
  auth_time: number;
  user_id?: string;
  sub: string;
  iat: number;
  exp: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  firebase?: {
    identities?: Record<string, any>;
    sign_in_provider?: string;
  };
  [key: string]: any;
}

export interface FirebaseTokenVerifyResult {
  valid: boolean;
  uid?: string;
  email?: string;
  email_verified?: boolean;
  payload?: FirebaseIdTokenPayload;
  error?: string;
  code?: 
    | 'MISSING_TOKEN'
    | 'INVALID_FORMAT'
    | 'INVALID_ALGORITHM'
    | 'MISSING_KID'
    | 'PROJECT_MISMATCH'
    | 'INVALID_ISSUER'
    | 'TOKEN_EXPIRED'
    | 'ISSUED_IN_FUTURE'
    | 'INVALID_SIGNATURE'
    | 'TOKEN_REVOKED'
    | 'UNKNOWN_KEY';
}

export interface TokenVerifyOptions {
  expectedProjectId: string;
  checkRevoked?: boolean;
  revocationTimestamp?: number; // Secondes
  customPublicCerts?: Record<string, string>; // Pour tests unitaires et environnements isolés
  clockToleranceSeconds?: number;
}

let cachedGoogleCerts: Record<string, string> | null = null;
let certsExpiryTime = 0;

/**
 * Récupère les certificats x509 publics officiels de Google pour Firebase Auth.
 */
export async function getGooglePublicCerts(): Promise<Record<string, string>> {
  if (cachedGoogleCerts && Date.now() < certsExpiryTime) {
    return cachedGoogleCerts;
  }

  const certsUrl = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
  const response = await fetch(certsUrl);
  if (!response.ok) {
    throw new Error(`Échec de récupération des certificats publics Google (${response.status})`);
  }

  // Parse cache-control header
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;

  cachedGoogleCerts = await response.json();
  certsExpiryTime = Date.now() + maxAge * 1000;
  return cachedGoogleCerts!;
}

/**
 * Réinitialise le cache des certificats (utilisé pour les tests)
 */
export function clearCertCache(): void {
  cachedGoogleCerts = null;
  certsExpiryTime = 0;
}

/**
 * Décode un segment Base64URL
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Valide de manière stricte et officielle un jeton d'authentification Firebase.
 */
export async function verifyFirebaseIdToken(
  token: string | undefined | null,
  options: TokenVerifyOptions
): Promise<FirebaseTokenVerifyResult> {
  const { 
    expectedProjectId, 
    checkRevoked = false, 
    revocationTimestamp, 
    customPublicCerts,
    clockToleranceSeconds = 5 
  } = options;

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return { valid: false, error: 'Jeton Firebase absent', code: 'MISSING_TOKEN' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Structure JWT invalide (3 segments requis)', code: 'INVALID_FORMAT' };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Décodage et validation de l'en-tête (Header)
  let header: { alg?: string; kid?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerB64));
  } catch (e) {
    return { valid: false, error: 'En-tête JWT malformé', code: 'INVALID_FORMAT' };
  }

  if (header.alg !== 'RS256') {
    return { 
      valid: false, 
      error: `Algorithme invalide : RS256 attendu, reçu "${header.alg}"`, 
      code: 'INVALID_ALGORITHM' 
    };
  }

  if (!header.kid || typeof header.kid !== 'string') {
    return { valid: false, error: 'Identifiant de clé (kid) manquant dans l\'en-tête', code: 'MISSING_KID' };
  }

  // 2. Décodage du payload
  let payload: FirebaseIdTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (e) {
    return { valid: false, error: 'Payload JWT malformé', code: 'INVALID_FORMAT' };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // 3. Validation de l'audience (doit être le projet Firebase configuré)
  if (!expectedProjectId || payload.aud !== expectedProjectId) {
    return { 
      valid: false, 
      error: `Projet Firebase incompatible : jeton émis pour "${payload.aud}", projet attendu "${expectedProjectId}"`, 
      code: 'PROJECT_MISMATCH' 
    };
  }

  // 4. Validation de l'émetteur (iss)
  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;
  if (payload.iss !== expectedIssuer) {
    return { 
      valid: false, 
      error: `Émetteur invalide : attendu "${expectedIssuer}", reçu "${payload.iss}"`, 
      code: 'INVALID_ISSUER' 
    };
  }

  // 5. Validation de la date d'expiration (exp)
  if (!payload.exp || (nowSec - clockToleranceSeconds) >= payload.exp) {
    return { 
      valid: false, 
      error: `Jeton Firebase expiré (expiré le ${new Date(payload.exp * 1000).toISOString()})`, 
      code: 'TOKEN_EXPIRED' 
    };
  }

  // 6. Validation de la date d'émission (iat)
  if (!payload.iat || payload.iat > (nowSec + 300)) {
    return { 
      valid: false, 
      error: 'Jeton émis dans le futur (incohérence d\'horloge)', 
      code: 'ISSUED_IN_FUTURE' 
    };
  }

  // 7. Validation de l'UID (sub)
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    return { valid: false, error: 'Identifiant utilisateur Firebase (sub) manquant ou vide', code: 'INVALID_FORMAT' };
  }

  // 8. Vérification de révocation
  if (checkRevoked && revocationTimestamp !== undefined && typeof payload.auth_time === 'number') {
    if (payload.auth_time < revocationTimestamp) {
      return { 
        valid: false, 
        error: 'Jeton Firebase révoqué : session antérieure à la date de révocation', 
        code: 'TOKEN_REVOKED' 
      };
    }
  }

  // 9. Vérification cryptographique de la signature RS256
  let cert: string | undefined;
  if (customPublicCerts) {
    cert = customPublicCerts[header.kid];
  } else {
    try {
      const publicCerts = await getGooglePublicCerts();
      cert = publicCerts[header.kid];
    } catch (e: any) {
      return { valid: false, error: `Erreur lors de la récupération des clés publiques Google : ${e.message}`, code: 'UNKNOWN_KEY' };
    }
  }

  if (!cert) {
    return { 
      valid: false, 
      error: `Clé publique introuvable pour kid="${header.kid}". Jeton forgé ou clé obsolète.`, 
      code: 'UNKNOWN_KEY' 
    };
  }

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    const signatureBuffer = Buffer.from(signatureB64, 'base64url');
    const isSignatureValid = verifier.verify(cert, signatureBuffer);

    if (!isSignatureValid) {
      return { 
        valid: false, 
        error: 'Signature cryptographique RS256 invalide : jeton altéré ou contrefait', 
        code: 'INVALID_SIGNATURE' 
      };
    }
  } catch (err: any) {
    return { 
      valid: false, 
      error: `Échec de validation de la signature cryptographique : ${err.message}`, 
      code: 'INVALID_SIGNATURE' 
    };
  }

  return {
    valid: true,
    uid: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified,
    payload,
  };
}
