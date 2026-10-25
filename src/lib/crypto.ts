/**
 * Module cryptographique durci conforme aux spécifications de sécurité.
 * - AES-GCM 256 bits avec IV aléatoire de 12 octets par opération.
 * - PBKDF2 (SHA-256, 100 000 itérations) avec sel aléatoire de 16 octets par dérivation.
 * - Format versionné (v2) encapsulant sel, IV et données chiffrées avec rétrocompatibilité v1.
 * - Hachage et vérification de mots de passe par PBKDF2 avec sel aléatoire (format `pbkdf2:v2:salt:hash`).
 */

const CURRENT_FORMAT_VERSION = 'v2';

/**
 * Hache un mot de passe avec un sel aléatoire de 16 octets et PBKDF2 (100 000 itérations).
 * Renvoie une chaîne au format `pbkdf2:v2:<saltHex>:<hashHex>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  return `pbkdf2:v2:${saltHex}:${hashHex}`;
}

/**
 * Vérifie un mot de passe par rapport au hachage stocké (gère le format v2 avec sel aléatoire et le format hérité v1).
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;

  // Format sécurisé v2 : `pbkdf2:v2:<saltHex>:<hashHex>`
  if (storedHash.startsWith('pbkdf2:v2:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 4) return false;
    const saltHex = parts[2];
    const expectedHashHex = parts[3];

    const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const hashBuffer = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const calculatedHashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    return calculatedHashHex === expectedHashHex;
  }

  // Rétrocompatibilité avec l'ancien hachage SHA-256 statique v1
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + '-salt-genealogor');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const legacyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (legacyHash === storedHash) return true;
  } catch (e) {}

  return false;
}

/**
 * Dérive une clé AES-GCM 256 bits à partir d'un mot de passe et d'un sel spécifique.
 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Chiffre des données avec AES-GCM 256 bits.
 * Chaque opération génère un NOUVEAU sel de 16 octets et un NOUVEAU vecteur d'initialisation (IV) de 12 octets.
 * Sortie au format versionné : `v2:<base64(salt + iv + ciphertext)>`.
 */
export async function encryptData(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  // Assemblage binaire : [16 octets salt | 12 octets iv | ciphertext...]
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  let binary = '';
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }

  return `${CURRENT_FORMAT_VERSION}:${btoa(binary)}`;
}

/**
 * Déchiffre les données en vérifiant l'intégrité du tag AES-GCM et le format versionné.
 */
export async function decryptData(encryptedPayload: string, password: string): Promise<string> {
  if (!encryptedPayload) throw new Error('Donnée chiffrée vide');

  // Format versionné v2
  if (encryptedPayload.startsWith('v2:')) {
    const base64Data = encryptedPayload.slice(3);
    const binary = atob(base64Data);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }

    if (combined.length < 28) {
      throw new Error('Payload chiffré trop court ou corrompu');
    }

    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const ciphertext = combined.slice(28);

    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  }

  // Rétrocompatibilité avec le format v1 (salt constant, [12 octets iv | ciphertext])
  try {
    const legacySalt = new TextEncoder().encode('Genealogor-Family-Tree-Salt-v2');
    const binary = atob(encryptedPayload);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      combined[i] = binary.charCodeAt(i);
    }
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await deriveKey(password, legacySalt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    throw new Error('Échec du déchiffrement : mot de passe incorrect ou données altérées.');
  }
}

/**
 * Génère un jeton aléatoire cryptographiquement sécurisé de 32 caractères hexadécimaux.
 */
export function generateShareToken(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

export interface PassphraseQualityResult {
  score: number; // 0 à 4
  level: 'too_short' | 'weak' | 'medium' | 'strong';
  label: string;
  isAcceptable: boolean;
  feedback?: string;
}

/**
 * Évalue rigoureusement la qualité d'une phrase secrète de chiffrement :
 * - Rejette les phrases trop courtes (< 8 caractères).
 * - Détecte et rejette les phrases communes ou triviales (azerty, password, 12345678, etc.).
 * - Évalue la diversité (longueur >= 12, mélange minuscules/majuscules, chiffres, symboles).
 */
export function evaluatePassphraseQuality(passphrase: string): PassphraseQualityResult {
  const trimmed = passphrase.trim();
  if (trimmed.length < 8) {
    return {
      score: 0,
      level: 'too_short',
      label: 'Trop courte (< 8 car.)',
      isAcceptable: false,
      feedback: 'La phrase secrète doit comporter au moins 8 caractères.',
    };
  }

  const trivialList = new Set([
    'password', '12345678', '123456789', 'azerty123', 'admin123', 
    'motdepasse', 'genealogie', 'famille123', 'secret123', 'qwerty123'
  ]);

  if (trivialList.has(trimmed.toLowerCase())) {
    return {
      score: 1,
      level: 'weak',
      label: 'Trop triviale',
      isAcceptable: false,
      feedback: 'Cette phrase secrète est trop commune et prévisible. Choisissez une phrase plus complexe.',
    };
  }

  let score = 1;
  if (trimmed.length >= 12) score++;
  if (/[0-9]/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) score++;
  if (/[^a-zA-Z0-9]/.test(trimmed)) score++;

  if (score >= 3) {
    return {
      score,
      level: 'strong',
      label: 'Robuste (recommandée)',
      isAcceptable: true,
    };
  } else if (score === 2) {
    return {
      score,
      level: 'medium',
      label: 'Moyenne (acceptable)',
      isAcceptable: true,
      feedback: 'Conseil : ajoutez des symboles ou allongez la phrase pour une protection maximale.',
    };
  } else {
    return {
      score,
      level: 'weak',
      label: 'Faible',
      isAcceptable: false,
      feedback: 'Ajoutez des chiffres et des symboles pour renforcer la sécurité.',
    };
  }
}

