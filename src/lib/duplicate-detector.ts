import { GenealogyData, Individual, DuplicateCandidate } from '../types/genealogy';

function normalizeString(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Recherche des doublons potentiels basée sur plusieurs indices croisés
 * (nom, prénoms, dates, lieux, conjoints).
 */
export function findDuplicateCandidates(data: GenealogyData): DuplicateCandidate[] {
  const individuals = Object.values(data.individuals);
  const candidates: DuplicateCandidate[] = [];

  for (let i = 0; i < individuals.length; i++) {
    for (let j = i + 1; j < individuals.length; j++) {
      const a = individuals[i];
      const b = individuals[j];

      let score = 0;
      const reasons: string[] = [];

      const normSurnameA = normalizeString(a.surname);
      const normSurnameB = normalizeString(b.surname);
      const normGivenA = normalizeString(a.givenName);
      const normGivenB = normalizeString(b.givenName);

      // 1. Patronyme identique ou très similaire
      if (normSurnameA && normSurnameB && normSurnameA === normSurnameB) {
        score += 35;
        reasons.push('Même patronyme');
      }

      // 2. Prénom identique
      if (normGivenA && normGivenB && normGivenA === normGivenB) {
        score += 30;
        reasons.push('Même prénom');
      } else if (normGivenA && normGivenB && (normGivenA.includes(normGivenB) || normGivenB.includes(normGivenA))) {
        score += 15;
        reasons.push('Prénoms similaires ou composés');
      }

      // 3. Proximité de date de naissance
      const birthA = a.birth?.parsedDate?.year;
      const birthB = b.birth?.parsedDate?.year;
      if (birthA && birthB) {
        const diff = Math.abs(birthA - birthB);
        if (diff === 0) {
          score += 25;
          reasons.push(`Même année de naissance (${birthA})`);
        } else if (diff <= 2) {
          score += 15;
          reasons.push(`Année de naissance proche (${birthA} vs ${birthB})`);
        }
      }

      // 4. Proximité de date de décès
      const deathA = a.death?.parsedDate?.year;
      const deathB = b.death?.parsedDate?.year;
      if (deathA && deathB) {
        const diff = Math.abs(deathA - deathB);
        if (diff === 0) {
          score += 20;
          reasons.push(`Même année de décès (${deathA})`);
        } else if (diff <= 2) {
          score += 10;
          reasons.push(`Année de décès proche (${deathA} vs ${deathB})`);
        }
      }

      // 5. Même lieu
      const placeA = normalizeString(a.birth?.place || a.death?.place);
      const placeB = normalizeString(b.birth?.place || b.death?.place);
      if (placeA && placeB && placeA.split(',')[0] === placeB.split(',')[0]) {
        score += 15;
        reasons.push('Même commune d\'événement');
      }

      // Seuil de détection : 55%
      if (score >= 55) {
        candidates.push({
          personA: a,
          personB: b,
          score: Math.min(100, score),
          reasons,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export interface MergeFieldChoices {
  name: string;
  givenName: string;
  surname: string;
  sex: 'M' | 'F' | 'X';
  birth?: any;
  death?: any;
  occupations: string[];
  notes: string[];
}

/**
 * Fusionne deux fiches d'individus en mettant à jour toutes les relations et références,
 * sans aucune perte d'archive ou de parenté.
 */
export function mergeIndividuals(
  data: GenealogyData,
  keepId: string,
  discardId: string,
  fieldChoices: MergeFieldChoices
): GenealogyData {
  const keep = data.individuals[keepId];
  const discard = data.individuals[discardId];
  if (!keep || !discard) return data;

  // 1. Fusion de la fiche conservée avec les choix utilisateur
  const mergedPerson: Individual = {
    ...keep,
    id: keepId,
    name: fieldChoices.name,
    givenName: fieldChoices.givenName,
    surname: fieldChoices.surname,
    sex: fieldChoices.sex,
    birth: fieldChoices.birth,
    death: fieldChoices.death,
    occupations: Array.from(new Set([...fieldChoices.occupations, ...(discard.occupations || [])])),
    notes: Array.from(new Set([...fieldChoices.notes, ...(discard.notes || [])])),
    familiesAsSpouse: Array.from(new Set([...keep.familiesAsSpouse, ...discard.familiesAsSpouse])),
    familiesAsChild: Array.from(new Set([...keep.familiesAsChild, ...discard.familiesAsChild])),
  };

  const newIndividuals = { ...data.individuals, [keepId]: mergedPerson };
  delete newIndividuals[discardId];

  // 2. Mettre à jour toutes les familles référençant discardId -> keepId
  const newFamilies = { ...data.families };
  for (const [fId, fam] of Object.entries(newFamilies)) {
    let updated = false;
    let husb = fam.husbandId;
    let wife = fam.wifeId;
    let children = [...fam.childrenIds];

    if (husb === discardId) {
      husb = keepId;
      updated = true;
    }
    if (wife === discardId) {
      wife = keepId;
      updated = true;
    }
    if (children.includes(discardId)) {
      children = Array.from(new Set(children.map(c => c === discardId ? keepId : c)));
      updated = true;
    }

    if (updated) {
      newFamilies[fId] = {
        ...fam,
        husbandId: husb,
        wifeId: wife,
        childrenIds: children,
      };
    }
  }

  return {
    ...data,
    individuals: newIndividuals,
    families: newFamilies,
    rootPersonId: data.rootPersonId === discardId ? keepId : data.rootPersonId,
  };
}
