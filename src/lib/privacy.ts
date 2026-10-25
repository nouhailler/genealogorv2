import { GenealogyData, Individual, Family, ArchiveDocument } from '../types/genealogy';

export type VitalStatus = 'deceased' | 'probably_alive' | 'unknown';

export interface PrivacyPolicy {
  hideLiving: boolean;
  hideUnknown: boolean;
  maskExactDates?: boolean;
  maskPlaces?: boolean;
  maskNotes?: boolean;
}

export const DEFAULT_PRIVACY_POLICY: PrivacyPolicy = {
  hideLiving: true,
  hideUnknown: true,
  maskExactDates: true,
  maskPlaces: true,
  maskNotes: true,
};

/**
 * Détermine le statut vital d'un individu de façon conservatrice.
 * Une absence de date de décès ne signifie PAS que la personne est décédée.
 */
export function determineVitalStatus(person: Individual, data?: GenealogyData): VitalStatus {
  // 1. Décès ou sépulture documenté
  if (person.death && (person.death.date || person.death.place || person.death.parsedDate?.year)) {
    return 'deceased';
  }
  if (person.burial && (person.burial.date || person.burial.place || person.burial.parsedDate?.year)) {
    return 'deceased';
  }

  const currentYear = new Date().getFullYear();

  // 2. Date de naissance disponible
  if (person.birth?.parsedDate?.year) {
    const age = currentYear - person.birth.parsedDate.year;
    if (age < 100) {
      return 'probably_alive';
    }
    return 'deceased';
  }

  // 3. Déduction contextuelle via les parents, conjoints et enfants si les données sont fournies
  if (data) {
    // Vérifier les parents
    for (const famId of person.familiesAsChild) {
      const fam = data.families[famId];
      if (fam) {
        const father = fam.husbandId ? data.individuals[fam.husbandId] : null;
        const mother = fam.wifeId ? data.individuals[fam.wifeId] : null;

        const fatherBirth = father?.birth?.parsedDate?.year;
        const motherBirth = mother?.birth?.parsedDate?.year;

        // Si les parents sont nés il y a moins de 120 ans, l'enfant est très probablement vivant
        if ((fatherBirth && currentYear - fatherBirth < 120) || (motherBirth && currentYear - motherBirth < 120)) {
          return 'probably_alive';
        }

        // Si les parents sont nés il y a plus de 160 ans, la personne est certainement décédée
        if ((fatherBirth && currentYear - fatherBirth > 160) || (motherBirth && currentYear - motherBirth > 160)) {
          return 'deceased';
        }
      }
    }

    // Vérifier les enfants
    for (const famId of person.familiesAsSpouse) {
      const fam = data.families[famId];
      if (fam) {
        for (const childId of fam.childrenIds) {
          const child = data.individuals[childId];
          const childBirth = child?.birth?.parsedDate?.year;
          // Si un enfant est né il y a moins de 80 ans, le parent peut être vivant
          if (childBirth && currentYear - childBirth < 80) {
            return 'probably_alive';
          }
        }
      }
    }
  }

  // 4. Sans aucune information probante, le statut reste inconnu (traité comme protégé par prudence)
  return 'unknown';
}

export function isLiving(person: Individual, data?: GenealogyData): boolean {
  const status = determineVitalStatus(person, data);
  return status === 'probably_alive';
}

export function shouldProtectPerson(
  person: Individual, 
  policy: PrivacyPolicy = DEFAULT_PRIVACY_POLICY, 
  data?: GenealogyData
): boolean {
  const status = determineVitalStatus(person, data);
  if (status === 'deceased') return false;
  if (status === 'probably_alive' && policy.hideLiving) return true;
  if (status === 'unknown' && policy.hideUnknown) return true;
  return false;
}

/**
 * Retourne l'ensemble des IDs d'individus protégés dans un arbre généalogique.
 */
export function getProtectedPersonIds(
  data: GenealogyData, 
  policy: PrivacyPolicy = DEFAULT_PRIVACY_POLICY
): Set<string> {
  const protectedIds = new Set<string>();
  if (!data || !data.individuals) return protectedIds;

  for (const [id, ind] of Object.entries(data.individuals)) {
    if (shouldProtectPerson(ind, policy, data)) {
      protectedIds.add(id);
    }
  }
  return protectedIds;
}

/**
 * Masque et anonymise de façon étanche les données sensibles d'un individu protégé.
 * RÈGLE DE SÉCURITÉ : Ne jamais utiliser de destructuration (...person) afin d'interdire
 * toute fuite accidentelle de champs sensibles (citations, media, notes, unsupported tags, etc.).
 */
export function sanitizePersonForPrivacy(
  person: Individual, 
  policy: PrivacyPolicy = DEFAULT_PRIVACY_POLICY, 
  data?: GenealogyData
): Individual {
  if (!shouldProtectPerson(person, policy, data)) {
    return person;
  }

  const birthYear = person.birth?.parsedDate?.year;

  // Construction stricte sur liste blanche exclusive (strict whitelist)
  const sanitized: Individual = {
    id: person.id,
    sex: person.sex || 'X',
    name: person.surname ? `${person.surname} [Privé]` : '[Confidentiel]',
    givenName: '[Confidentiel]',
    surname: person.surname || '[Confidentiel]',
    familiesAsChild: Array.isArray(person.familiesAsChild) ? [...person.familiesAsChild] : [],
    familiesAsSpouse: Array.isArray(person.familiesAsSpouse) ? [...person.familiesAsSpouse] : [],
    occupations: [],
    residences: [],
    citations: [],
    media: [],
    notes: ['Données masquées conformément à la politique de confidentialité des personnes vivantes (RGPD).'],
    sosaNumber: person.sosaNumber,
    dAbovilleNumber: person.dAbovilleNumber,
    generation: person.generation,
  };

  // Année de naissance brute sans jour, mois, lieu précis ni notes
  if (birthYear) {
    sanitized.birth = {
      parsedDate: { raw: `${birthYear}`, year: birthYear },
      date: `${birthYear}`,
      place: policy.maskPlaces ? undefined : person.birth?.place,
    };
  }

  return sanitized;
}

/**
 * Anonymise et filtre une famille impliquant des personnes vivantes ou protégées.
 * Supprime les événements sensibles (divorce), notes familiales, citations et médias contemporains.
 */
export function sanitizeFamilyForPrivacy(
  family: Family,
  protectedPersonIds: Set<string>,
  policy: PrivacyPolicy = DEFAULT_PRIVACY_POLICY
): Family {
  const husbProtected = family.husbandId ? protectedPersonIds.has(family.husbandId) : false;
  const wifeProtected = family.wifeId ? protectedPersonIds.has(family.wifeId) : false;
  const anyChildProtected = family.childrenIds?.some(cid => protectedPersonIds.has(cid)) || false;

  const isFamilyProtected = husbProtected || wifeProtected || anyChildProtected;

  if (!isFamilyProtected) {
    return family;
  }

  // Filtrage strict : conservation de la structure relationnelle avec purge des données intimes
  const sanitized: Family = {
    id: family.id,
    husbandId: family.husbandId,
    wifeId: family.wifeId,
    childrenIds: Array.isArray(family.childrenIds) ? [...family.childrenIds] : [],
    notes: ['Notes de famille confidentielles masquées.'],
    citations: [],
    media: [],
  };

  // Si le couple comporte une personne vivante, le divorce est une donnée confidentielle
  if (husbProtected || wifeProtected) {
    sanitized.divorce = undefined;
  }

  // Traitement sécurisé du mariage
  if (family.marriage) {
    const marrYear = family.marriage.parsedDate?.year;
    if (marrYear) {
      sanitized.marriage = {
        date: policy.maskExactDates ? `${marrYear}` : family.marriage.date,
        parsedDate: { raw: `${marrYear}`, year: marrYear },
        place: policy.maskPlaces ? undefined : family.marriage.place,
      };
    } else if (!policy.maskExactDates) {
      sanitized.marriage = {
        date: family.marriage.date,
        place: policy.maskPlaces ? undefined : family.marriage.place,
      };
    }
  }

  return sanitized;
}

/**
 * Filtre ou anonymise un document d'archive concernant des personnes protégées.
 * - Si le document est un acte d'état civil contemporain ou une photo de vivants : exclu.
 * - Si le document concerne des défunts et vivants : tags des vivants masqués et notes nettoyées.
 */
export function sanitizeArchiveForPrivacy(
  archive: ArchiveDocument,
  protectedPersonIds: Set<string>,
  policy: PrivacyPolicy = DEFAULT_PRIVACY_POLICY
): ArchiveDocument | null {
  if (!policy.hideLiving) {
    return archive;
  }

  const linkedProtected = archive.linkedPersonIds.filter(id => protectedPersonIds.has(id));
  const hasProtectedLinks = linkedProtected.length > 0;

  // Tagging interactif sur photo
  const hasProtectedPhotoTags = archive.photoTags?.some(t => protectedPersonIds.has(t.personId)) || false;

  // 1. Si tous les individus liés sont vivants/protégés, le document est totalement exclu
  if (hasProtectedLinks && linkedProtected.length === archive.linkedPersonIds.length) {
    return null;
  }

  // 2. Si le document est un portrait photo ou un acte civil récent lié à au moins un vivant
  if ((archive.type === 'photo' || archive.type === 'birth' || archive.type === 'livret') && (hasProtectedLinks || hasProtectedPhotoTags)) {
    return null;
  }

  // 3. Document mixte (ex: photo de groupe familial ou acte notarié ancien avec descendants)
  // Conserver le document mais purger tout tag ou référence aux personnes vivantes
  if (hasProtectedLinks || hasProtectedPhotoTags) {
    return {
      ...archive,
      linkedPersonIds: archive.linkedPersonIds.filter(id => !protectedPersonIds.has(id)),
      photoTags: archive.photoTags
        ? archive.photoTags.filter(t => !protectedPersonIds.has(t.personId))
        : [],
      notes: policy.maskNotes ? undefined : archive.notes,
      transcription: policy.maskNotes ? undefined : archive.transcription,
    };
  }

  return archive;
}

/**
 * Filtre l'ensemble des archives selon la politique de confidentialité.
 */
export function sanitizeArchivesForPrivacy(
  archives: ArchiveDocument[],
  protectedPersonIds: Set<string>,
  policy: PrivacyPolicy = DEFAULT_PRIVACY_POLICY
): ArchiveDocument[] {
  if (!policy.hideLiving) return archives;

  const result: ArchiveDocument[] = [];
  for (const arc of archives) {
    const sanitized = sanitizeArchiveForPrivacy(arc, protectedPersonIds, policy);
    if (sanitized) {
      result.push(sanitized);
    }
  }
  return result;
}

/**
 * Filtre et aseptise de manière globale un jeu complet de généalogie (individus, familles).
 */
export function sanitizeGenealogyDataForPrivacy(
  data: GenealogyData,
  policy: PrivacyPolicy = DEFAULT_PRIVACY_POLICY
): GenealogyData {
  if (!data) return data;
  if (!policy.hideLiving && !policy.hideUnknown) return data;

  const protectedIds = getProtectedPersonIds(data, policy);

  const sanitizedIndividuals: Record<string, Individual> = {};
  for (const [id, ind] of Object.entries(data.individuals || {})) {
    sanitizedIndividuals[id] = sanitizePersonForPrivacy(ind, policy, data);
  }

  const sanitizedFamilies: Record<string, Family> = {};
  for (const [fId, fam] of Object.entries(data.families || {})) {
    sanitizedFamilies[fId] = sanitizeFamilyForPrivacy(fam, protectedIds, policy);
  }

  return {
    ...data,
    individuals: sanitizedIndividuals,
    families: sanitizedFamilies,
  };
}
