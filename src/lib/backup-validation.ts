import { GenealogyData, Individual, Family, ArchiveDocument, BranchAccess, ArchiveDocumentType, Sex } from '../types/genealogy';

export const BACKUP_LIMITS = {
  MAX_FILE_BYTES: 50 * 1024 * 1024,      // 50 MB max backup file size
  MAX_INDIVIDUALS: 50000,                // 50,000 individuals max
  MAX_FAMILIES: 25000,                   // 25,000 families max
  MAX_ARCHIVES: 5000,                    // 5,000 documents max
  MAX_ACCESS_RULES: 500,                 // 500 access rules max
  MAX_SINGLE_ARCHIVE_BYTES: 15 * 1024 * 1024, // 15 MB max per base64 file
};

const VALID_ARCHIVE_TYPES: Set<string> = new Set([
  'birth', 'baptism', 'marriage', 'death', 'burial',
  'census', 'notarial', 'military', 'livret', 'photo', 'other'
]);

const VALID_SEXES: Set<string> = new Set(['M', 'F', 'X']);
const VALID_ROLES: Set<string> = new Set(['viewer', 'editor', 'admin']);
const VALID_BRANCHES: Set<string> = new Set(['all', 'paternal', 'maternal', 'custom']);

export interface BackupValidationSummary {
  individualsCount: number;
  familiesCount: number;
  archivesCount: number;
  accessRulesCount: number;
  verifiedRelationsCount: number;
  repairedCrossReferencesCount: number;
}

export interface BackupValidationResult {
  isValid: boolean;
  schemaErrors: string[];
  integrityErrors: string[];
  warnings: string[];
  summary: BackupValidationSummary;
  sanitizedPayload?: {
    genealogy: GenealogyData;
    archives: ArchiveDocument[];
    accessList: BranchAccess[];
  };
}

/**
 * Valide rigoureusement le schéma, les limites de dimensionnement et
 * la cohérence relationnelle (individus, familles, archives) d'une sauvegarde.
 */
export function validateBackupPayload(
  payload: any, 
  rawCharLength?: number
): BackupValidationResult {
  const schemaErrors: string[] = [];
  const integrityErrors: string[] = [];
  const warnings: string[] = [];

  let verifiedRelationsCount = 0;
  let repairedCrossReferencesCount = 0;

  // 1. Limite de taille globale du fichier
  if (rawCharLength && rawCharLength > BACKUP_LIMITS.MAX_FILE_BYTES) {
    schemaErrors.push(
      `Taille de sauvegarde excessive : ${Math.round(rawCharLength / (1024 * 1024))} Mo (limite autorisée : 50 Mo).`
    );
    return {
      isValid: false,
      schemaErrors,
      integrityErrors,
      warnings,
      summary: {
        individualsCount: 0,
        familiesCount: 0,
        archivesCount: 0,
        accessRulesCount: 0,
        verifiedRelationsCount: 0,
        repairedCrossReferencesCount: 0,
      },
    };
  }

  // 2. Vérification racine de l'objet
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    schemaErrors.push('La charge utile de la sauvegarde n\'est pas un objet JSON valide.');
    return {
      isValid: false,
      schemaErrors,
      integrityErrors,
      warnings,
      summary: {
        individualsCount: 0,
        familiesCount: 0,
        archivesCount: 0,
        accessRulesCount: 0,
        verifiedRelationsCount: 0,
        repairedCrossReferencesCount: 0,
      },
    };
  }

  // 3. Validation de l'arbre généalogique (genealogy)
  if (!payload.genealogy || typeof payload.genealogy !== 'object' || Array.isArray(payload.genealogy)) {
    schemaErrors.push('Propriété "genealogy" manquante ou de format invalide.');
  }

  const rawIndividuals = payload.genealogy?.individuals;
  if (!rawIndividuals || typeof rawIndividuals !== 'object' || Array.isArray(rawIndividuals)) {
    schemaErrors.push('Propriété "genealogy.individuals" manquante ou invalide (doit être un dictionnaire d\'individus).');
  }

  const rawFamilies = payload.genealogy?.families;
  if (!rawFamilies || typeof rawFamilies !== 'object' || Array.isArray(rawFamilies)) {
    schemaErrors.push('Propriété "genealogy.families" manquante ou invalide (doit être un dictionnaire de familles).');
  }

  const rawArchives = payload.archives;
  if (!Array.isArray(rawArchives)) {
    schemaErrors.push('Propriété "archives" manquante ou invalide (doit être un tableau de documents).');
  }

  const rawAccessList = payload.accessList;
  if (!Array.isArray(rawAccessList)) {
    schemaErrors.push('Propriété "accessList" manquante ou invalide (doit être un tableau de règles d\'accès).');
  }

  // Arrêt précoce si le schéma fondamental est rompu
  if (schemaErrors.length > 0) {
    return {
      isValid: false,
      schemaErrors,
      integrityErrors,
      warnings,
      summary: {
        individualsCount: 0,
        familiesCount: 0,
        archivesCount: 0,
        accessRulesCount: 0,
        verifiedRelationsCount: 0,
        repairedCrossReferencesCount: 0,
      },
    };
  }

  const indKeys = Object.keys(rawIndividuals);
  const famKeys = Object.keys(rawFamilies);

  // 4. Contrôle des limites quantitatives
  if (indKeys.length > BACKUP_LIMITS.MAX_INDIVIDUALS) {
    schemaErrors.push(`Nombre d'individus excessif : ${indKeys.length} (limite : ${BACKUP_LIMITS.MAX_INDIVIDUALS}).`);
  }
  if (famKeys.length > BACKUP_LIMITS.MAX_FAMILIES) {
    schemaErrors.push(`Nombre de familles excessif : ${famKeys.length} (limite : ${BACKUP_LIMITS.MAX_FAMILIES}).`);
  }
  if (rawArchives.length > BACKUP_LIMITS.MAX_ARCHIVES) {
    schemaErrors.push(`Nombre d'archives excessif : ${rawArchives.length} (limite : ${BACKUP_LIMITS.MAX_ARCHIVES}).`);
  }
  if (rawAccessList.length > BACKUP_LIMITS.MAX_ACCESS_RULES) {
    schemaErrors.push(`Nombre de règles d'accès excessif : ${rawAccessList.length} (limite : ${BACKUP_LIMITS.MAX_ACCESS_RULES}).`);
  }

  // Objets nettoyés et normalisés
  const sanitizedIndividuals: Record<string, Individual> = {};
  const sanitizedFamilies: Record<string, Family> = {};
  const sanitizedArchives: ArchiveDocument[] = [];
  const sanitizedAccessList: BranchAccess[] = [];

  // 5. Validation unitaire des individus
  for (const key of indKeys) {
    const rawInd = rawIndividuals[key];
    if (!rawInd || typeof rawInd !== 'object') {
      integrityErrors.push(`L'individu "${key}" n'est pas un objet valide.`);
      continue;
    }

    const id = typeof rawInd.id === 'string' ? rawInd.id.trim() : key;
    if (!id || id.length > 128) {
      integrityErrors.push(`Identifiant invalide ou trop long pour l'individu "${key}".`);
      continue;
    }

    if (id !== key) {
      warnings.push(`La clé d'index "${key}" ne correspondait pas à l'ID "${id}". Normalisé.`);
    }

    const name = typeof rawInd.name === 'string' && rawInd.name.trim().length > 0
      ? rawInd.name.trim()
      : 'Individu Inconnu';

    const sex: Sex = VALID_SEXES.has(rawInd.sex) ? rawInd.sex : 'X';

    const familiesAsChild: string[] = Array.isArray(rawInd.familiesAsChild)
      ? rawInd.familiesAsChild.filter((fid: any) => typeof fid === 'string' && fid.trim().length > 0)
      : [];

    const familiesAsSpouse: string[] = Array.isArray(rawInd.familiesAsSpouse)
      ? rawInd.familiesAsSpouse.filter((fid: any) => typeof fid === 'string' && fid.trim().length > 0)
      : [];

    sanitizedIndividuals[id] = {
      ...rawInd,
      id,
      name,
      sex,
      familiesAsChild,
      familiesAsSpouse,
      notes: Array.isArray(rawInd.notes) ? rawInd.notes.map((n: any) => String(n)) : [],
    };
  }

  // 6. Validation unitaire des familles
  for (const key of famKeys) {
    const rawFam = rawFamilies[key];
    if (!rawFam || typeof rawFam !== 'object') {
      integrityErrors.push(`La famille "${key}" n'est pas un objet valide.`);
      continue;
    }

    const id = typeof rawFam.id === 'string' ? rawFam.id.trim() : key;
    if (!id || id.length > 128) {
      integrityErrors.push(`Identifiant invalide ou trop long pour la famille "${key}".`);
      continue;
    }

    const husbandId = typeof rawFam.husbandId === 'string' && rawFam.husbandId.trim().length > 0
      ? rawFam.husbandId.trim()
      : undefined;

    const wifeId = typeof rawFam.wifeId === 'string' && rawFam.wifeId.trim().length > 0
      ? rawFam.wifeId.trim()
      : undefined;

    const childrenIds: string[] = Array.isArray(rawFam.childrenIds)
      ? rawFam.childrenIds.filter((cid: any) => typeof cid === 'string' && cid.trim().length > 0)
      : [];

    sanitizedFamilies[id] = {
      ...rawFam,
      id,
      husbandId,
      wifeId,
      childrenIds,
      notes: Array.isArray(rawFam.notes) ? rawFam.notes.map((n: any) => String(n)) : [],
    };
  }

  // 7. Contrôle des références croisées & cohérence relationnelle
  const validIndIds = new Set(Object.keys(sanitizedIndividuals));
  const validFamIds = new Set(Object.keys(sanitizedFamilies));

  // Vérifier références Individus -> Familles
  for (const ind of Object.values(sanitizedIndividuals)) {
    // Parenté (familiesAsChild)
    const validFamsAsChild: string[] = [];
    for (const famId of ind.familiesAsChild) {
      if (validFamIds.has(famId)) {
        validFamsAsChild.push(famId);
        verifiedRelationsCount++;
      } else {
        warnings.push(`Individu "${ind.name}" (${ind.id}) référence une famille d'origine inexistante "${famId}". Référence orpheline retirée.`);
      }
    }
    ind.familiesAsChild = validFamsAsChild;

    // Union (familiesAsSpouse)
    const validFamsAsSpouse: string[] = [];
    for (const famId of ind.familiesAsSpouse) {
      if (validFamIds.has(famId)) {
        validFamsAsSpouse.push(famId);
        verifiedRelationsCount++;
      } else {
        warnings.push(`Individu "${ind.name}" (${ind.id}) référence une union inexistante "${famId}". Référence orpheline retirée.`);
      }
    }
    ind.familiesAsSpouse = validFamsAsSpouse;
  }

  // Vérifier références Familles -> Individus & réciprocité
  for (const fam of Object.values(sanitizedFamilies)) {
    // Époux
    if (fam.husbandId) {
      if (validIndIds.has(fam.husbandId)) {
        verifiedRelationsCount++;
        const husband = sanitizedIndividuals[fam.husbandId];
        if (!husband.familiesAsSpouse.includes(fam.id)) {
          husband.familiesAsSpouse.push(fam.id);
          repairedCrossReferencesCount++;
        }
      } else {
        warnings.push(`Famille "${fam.id}" référence un époux inexistant "${fam.husbandId}". Référence annulée.`);
        fam.husbandId = undefined;
      }
    }

    // Épouse
    if (fam.wifeId) {
      if (validIndIds.has(fam.wifeId)) {
        verifiedRelationsCount++;
        const wife = sanitizedIndividuals[fam.wifeId];
        if (!wife.familiesAsSpouse.includes(fam.id)) {
          wife.familiesAsSpouse.push(fam.id);
          repairedCrossReferencesCount++;
        }
      } else {
        warnings.push(`Famille "${fam.id}" référence une épouse inexistante "${fam.wifeId}". Référence annulée.`);
        fam.wifeId = undefined;
      }
    }

    // Enfants
    const validChildren: string[] = [];
    for (const childId of fam.childrenIds) {
      if (validIndIds.has(childId)) {
        validChildren.push(childId);
        verifiedRelationsCount++;
        const child = sanitizedIndividuals[childId];
        if (!child.familiesAsChild.includes(fam.id)) {
          child.familiesAsChild.push(fam.id);
          repairedCrossReferencesCount++;
        }
      } else {
        warnings.push(`Famille "${fam.id}" référence un enfant inexistant "${childId}". Référence retirée.`);
      }
    }
    fam.childrenIds = validChildren;
  }

  // Vérifier rootPersonId
  let sanitizedRootPersonId = payload.genealogy?.rootPersonId;
  if (sanitizedRootPersonId) {
    if (!validIndIds.has(sanitizedRootPersonId)) {
      warnings.push(`La personne racine "${sanitizedRootPersonId}" n'existe pas dans l'arbre. Réassignée au premier individu disponible.`);
      sanitizedRootPersonId = indKeys[0] || undefined;
    }
  } else if (indKeys.length > 0) {
    sanitizedRootPersonId = indKeys[0];
  }

  // 8. Validation des Archives et intégrité de leurs liaisons
  for (let i = 0; i < rawArchives.length; i++) {
    const rawArc = rawArchives[i];
    if (!rawArc || typeof rawArc !== 'object') {
      integrityErrors.push(`Document d'archive à l'index ${i} non valide.`);
      continue;
    }

    const arcId = typeof rawArc.id === 'string' && rawArc.id.trim().length > 0 ? rawArc.id.trim() : `doc-${i + 1}`;
    const title = typeof rawArc.title === 'string' && rawArc.title.trim().length > 0 ? rawArc.title.trim() : `Document ${i + 1}`;
    const type: ArchiveDocumentType = VALID_ARCHIVE_TYPES.has(rawArc.type) ? rawArc.type : 'other';

    // Contrôle taille unitaire de fichier base64
    if (rawArc.fileData && typeof rawArc.fileData === 'string' && rawArc.fileData.length > BACKUP_LIMITS.MAX_SINGLE_ARCHIVE_BYTES) {
      integrityErrors.push(`Le fichier joint de l'archive "${title}" (${arcId}) dépasse la taille maximale autorisée (15 Mo).`);
      continue;
    }

    // Nettoyage des personnes liées inexistantes
    const linkedPersonIds: string[] = Array.isArray(rawArc.linkedPersonIds)
      ? rawArc.linkedPersonIds.filter((pid: any) => {
          if (typeof pid !== 'string') return false;
          if (validIndIds.has(pid)) {
            verifiedRelationsCount++;
            return true;
          }
          warnings.push(`Archive "${title}" (${arcId}) liée à une personne inexistante "${pid}". Référence retirée.`);
          return false;
        })
      : [];

    // Nettoyage des familles liées inexistantes
    const linkedFamilyIds: string[] = Array.isArray(rawArc.linkedFamilyIds)
      ? rawArc.linkedFamilyIds.filter((fid: any) => {
          if (typeof fid !== 'string') return false;
          if (validFamIds.has(fid)) {
            verifiedRelationsCount++;
            return true;
          }
          warnings.push(`Archive "${title}" (${arcId}) liée à une famille inexistante "${fid}". Référence retirée.`);
          return false;
        })
      : [];

    sanitizedArchives.push({
      ...rawArc,
      id: arcId,
      title,
      type,
      linkedPersonIds,
      linkedFamilyIds,
      createdAt: typeof rawArc.createdAt === 'number' ? rawArc.createdAt : Date.now(),
      updatedAt: typeof rawArc.updatedAt === 'number' ? rawArc.updatedAt : Date.now(),
    });
  }

  // 9. Validation des règles d'accès (accessList)
  for (let i = 0; i < rawAccessList.length; i++) {
    const rawAcc = rawAccessList[i];
    if (!rawAcc || typeof rawAcc !== 'object') continue;

    const accId = typeof rawAcc.id === 'string' ? rawAcc.id : `acc-${i + 1}`;
    const name = typeof rawAcc.name === 'string' ? rawAcc.name : `Accès ${i + 1}`;
    const branch = VALID_BRANCHES.has(rawAcc.branch) ? rawAcc.branch : 'all';
    const role = VALID_ROLES.has(rawAcc.role) ? rawAcc.role : 'viewer';

    sanitizedAccessList.push({
      ...rawAcc,
      id: accId,
      name,
      branch,
      role,
      createdAt: typeof rawAcc.createdAt === 'number' ? rawAcc.createdAt : Date.now(),
    });
  }

  const isValid = schemaErrors.length === 0 && integrityErrors.length === 0;

  return {
    isValid,
    schemaErrors,
    integrityErrors,
    warnings,
    summary: {
      individualsCount: Object.keys(sanitizedIndividuals).length,
      familiesCount: Object.keys(sanitizedFamilies).length,
      archivesCount: sanitizedArchives.length,
      accessRulesCount: sanitizedAccessList.length,
      verifiedRelationsCount,
      repairedCrossReferencesCount,
    },
    sanitizedPayload: isValid
      ? {
          genealogy: {
            individuals: sanitizedIndividuals,
            families: sanitizedFamilies,
            sources: payload.genealogy?.sources || {},
            rootPersonId: sanitizedRootPersonId,
            sourceHeader: payload.genealogy?.sourceHeader || 'Arbre Restauré',
          },
          archives: sanitizedArchives,
          accessList: sanitizedAccessList,
        }
      : undefined,
  };
}
