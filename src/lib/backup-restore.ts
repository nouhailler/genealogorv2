import { GenealogyData, ArchiveDocument, BranchAccess } from '../types/genealogy';
import { STORAGE_KEYS } from './storage-manager';
import { encryptData, decryptData } from './crypto';
import { validateBackupPayload, BackupValidationSummary, BACKUP_LIMITS } from './backup-validation';

export { BACKUP_LIMITS };

export interface BackupManifest {
  format: 'genealogor-backup-v2' | 'genealogor-backup-v2-encrypted';
  appVersion: string;
  exportedAt: string;
  treeTitle: string;
  stats: {
    individualsCount: number;
    familiesCount: number;
    archivesCount: number;
    accessRulesCount: number;
  };
  checksumSha256: string;
  isEncrypted?: boolean;
}

export interface BackupPackage {
  manifest: BackupManifest;
  payload?: {
    genealogy: GenealogyData;
    archives: ArchiveDocument[];
    accessList: BranchAccess[];
  };
  encryptedPayload?: string;
}

export interface BackupPreview {
  isValid: boolean;
  isEncrypted?: boolean;
  error?: string;
  manifest?: BackupManifest;
  dataSummary?: {
    rootPersonName?: string;
    earliestYear?: number;
    latestYear?: number;
    sampleSurnames: string[];
  };
  validationSummary?: BackupValidationSummary;
  validationWarnings?: string[];
}

async function computeChecksum(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Crée un paquet de sauvegarde complet avec manifeste, empreinte d'intégrité SHA-256
 * et option de chiffrement de bout en bout AES-GCM 256-bit avec phrase secrète.
 */
export async function createFullBackup(
  genealogy: GenealogyData,
  archives: ArchiveDocument[],
  accessList: BranchAccess[],
  passphrase?: string
): Promise<string> {
  const individuals = Object.values(genealogy.individuals || {});
  const families = Object.values(genealogy.families || {});

  const payload = {
    genealogy,
    archives,
    accessList,
  };

  const payloadString = JSON.stringify(payload);
  const checksum = await computeChecksum(payloadString);

  const isEncrypted = Boolean(passphrase && passphrase.trim().length > 0);

  const manifest: BackupManifest = {
    format: isEncrypted ? 'genealogor-backup-v2-encrypted' : 'genealogor-backup-v2',
    appVersion: '2.0.0',
    exportedAt: new Date().toISOString(),
    treeTitle: genealogy.sourceHeader || 'Arbre Familial',
    stats: {
      individualsCount: individuals.length,
      familiesCount: families.length,
      archivesCount: archives.length,
      accessRulesCount: accessList.length,
    },
    checksumSha256: checksum,
    isEncrypted,
  };

  if (isEncrypted) {
    const encryptedPayload = await encryptData(payloadString, passphrase!.trim());
    const backupPackage: BackupPackage = {
      manifest,
      encryptedPayload,
    };
    return JSON.stringify(backupPackage, null, 2);
  }

  const backupPackage: BackupPackage = {
    manifest,
    payload,
  };

  return JSON.stringify(backupPackage, null, 2);
}

/**
 * Prévisualise et valide l'intégrité et la conformité d'une sauvegarde avant restauration :
 * - Détecte les sauvegardes chiffrées et vérifie la phrase secrète AES-GCM.
 * - Contrôle formel de l'empreinte SHA-256.
 * - Validation stricte du schéma de données et limites de taille (50 Mo, 50 000 individus).
 * - Contrôle de la cohérence relationnelle (références croisées individus, familles, archives).
 */
export async function previewBackup(jsonContent: string, passphrase?: string): Promise<BackupPreview> {
  try {
    // 1. Limite de taille brute
    if (jsonContent.length > BACKUP_LIMITS.MAX_FILE_BYTES) {
      return {
        isValid: false,
        error: `Fichier de sauvegarde trop volumineux (${Math.round(jsonContent.length / (1024 * 1024))} Mo). Limite autorisée : 50 Mo.`,
      };
    }

    const parsed = JSON.parse(jsonContent);

    if (!parsed || typeof parsed !== 'object' || !parsed.manifest) {
      return { isValid: false, error: 'Structure de fichier de sauvegarde non reconnue (manifeste manquant).' };
    }

    const { manifest } = parsed as BackupPackage;

    if (
      manifest.format !== 'genealogor-backup-v2' && 
      manifest.format !== 'genealogor-backup-v2-encrypted' &&
      manifest.format !== ('genealogor-backup-v1' as any)
    ) {
      return { isValid: false, error: 'Format de sauvegarde non compatible.' };
    }

    // 2. Gestion du déchiffrement
    let payload = parsed.payload;

    if (manifest.format === 'genealogor-backup-v2-encrypted' || parsed.encryptedPayload) {
      if (!passphrase || passphrase.trim().length === 0) {
        return {
          isValid: false,
          isEncrypted: true,
          manifest,
          error: 'Cette sauvegarde est protégée par chiffrement AES-GCM. Veuillez saisir la phrase secrète.',
        };
      }

      try {
        const decryptedStr = await decryptData(parsed.encryptedPayload!, passphrase.trim());
        payload = JSON.parse(decryptedStr);
      } catch (decryptErr) {
        return {
          isValid: false,
          isEncrypted: true,
          manifest,
          error: 'Phrase secrète incorrecte ou sauvegarde altérée.',
        };
      }
    }

    if (!payload) {
      return { isValid: false, error: 'Contenu de la sauvegarde manquant ou inaccessible.' };
    }

    // 3. Contrôle d'intégrité cryptographique SHA-256
    const payloadString = JSON.stringify(payload);
    const calculatedChecksum = await computeChecksum(payloadString);

    if (calculatedChecksum !== manifest.checksumSha256) {
      return {
        isValid: false,
        error: 'Échec du contrôle d\'intégrité SHA-256 : le fichier a été altéré ou est incomplet.',
      };
    }

    // 4. Validation stricte du schéma et des relations croisées
    const validation = validateBackupPayload(payload, jsonContent.length);
    if (!validation.isValid) {
      const allErrors = [...validation.schemaErrors, ...validation.integrityErrors];
      return {
        isValid: false,
        isEncrypted: manifest.isEncrypted || Boolean(parsed.encryptedPayload),
        manifest,
        error: `Validation stricte échouée : ${allErrors.join(' | ')}`,
        validationSummary: validation.summary,
        validationWarnings: validation.warnings,
      };
    }

    const inds = Object.values((payload.genealogy?.individuals || {}) as Record<string, any>);
    let earliestYear: number | undefined;
    let latestYear: number | undefined;
    const surnames = new Set<string>();

    for (const ind of inds) {
      if (ind.surname) surnames.add(ind.surname);
      const bYear = ind.birth?.parsedDate?.year;
      if (bYear) {
        if (!earliestYear || bYear < earliestYear) earliestYear = bYear;
        if (!latestYear || bYear > latestYear) latestYear = bYear;
      }
    }

    const rootPerson = payload.genealogy?.rootPersonId
      ? payload.genealogy.individuals[payload.genealogy.rootPersonId]
      : inds[0];

    return {
      isValid: true,
      isEncrypted: manifest.isEncrypted || Boolean(parsed.encryptedPayload),
      manifest,
      dataSummary: {
        rootPersonName: rootPerson?.name || 'Inconnu',
        earliestYear,
        latestYear,
        sampleSurnames: Array.from(surnames).slice(0, 5),
      },
      validationSummary: validation.summary,
      validationWarnings: validation.warnings,
    };
  } catch (err) {
    return { isValid: false, error: 'Fichier JSON invalide ou corrompu.' };
  }
}

/**
 * Restaure une sauvegarde en effectuant une validation stricte, en normalisant
 * les références croisées et en créant au préalable une copie de secours de l'arbre courant.
 */
export async function restoreBackup(
  jsonContent: string,
  currentGenealogy: GenealogyData,
  currentArchives: ArchiveDocument[],
  currentAccess: BranchAccess[],
  passphrase?: string
): Promise<{ 
  success: boolean; 
  data?: NonNullable<BackupPackage['payload']>; 
  error?: string;
  warnings?: string[];
}> {
  const preview = await previewBackup(jsonContent, passphrase);
  if (!preview.isValid || !preview.manifest) {
    return { success: false, error: preview.error || 'Sauvegarde invalide' };
  }

  let rawPayload: any;
  const parsed = JSON.parse(jsonContent) as BackupPackage;
  if (parsed.encryptedPayload) {
    const decryptedStr = await decryptData(parsed.encryptedPayload, passphrase!.trim());
    rawPayload = JSON.parse(decryptedStr);
  } else {
    rawPayload = parsed.payload;
  }

  // Validation et nettoyage strict avant injection
  const validation = validateBackupPayload(rawPayload, jsonContent.length);
  if (!validation.isValid || !validation.sanitizedPayload) {
    return {
      success: false,
      error: `Erreur critique lors de la vérification préalable à l'écriture : ${validation.schemaErrors.concat(validation.integrityErrors).join(' ')}`,
    };
  }

  // Créer la sauvegarde pré-restauration de sécurité
  if (typeof localStorage !== 'undefined') {
    try {
      const preRestoreSafety = await createFullBackup(currentGenealogy, currentArchives, currentAccess);
      localStorage.setItem(STORAGE_KEYS.PRE_RESTORE_BACKUP, preRestoreSafety);
    } catch (e) {
      console.warn('Impossible de créer la sauvegarde pré-restauration', e);
    }
  }

  return {
    success: true,
    data: validation.sanitizedPayload,
    warnings: validation.warnings,
  };
}

/**
 * Restaure la sauvegarde de secours préalable s'il y a lieu.
 */
export function restorePreBackupSafety(): BackupPackage['payload'] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PRE_RESTORE_BACKUP);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BackupPackage;
    return parsed.payload || null;
  } catch (e) {
    return null;
  }
}
