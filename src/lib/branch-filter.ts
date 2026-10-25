import { GenealogyData, Individual, Family, BranchScope } from '../types/genealogy';
import { 
  shouldProtectPerson, 
  sanitizePersonForPrivacy, 
  sanitizeFamilyForPrivacy,
  getProtectedPersonIds,
  isLiving, 
  DEFAULT_PRIVACY_POLICY 
} from './privacy';

export { isLiving };

export function getBranchIndividuals(
  data: GenealogyData,
  rootPersonId: string,
  scope: BranchScope
): Set<string> {
  const allowed = new Set<string>();
  const root = data.individuals[rootPersonId];
  if (!root) return new Set(Object.keys(data.individuals));

  if (scope === 'all') {
    return new Set(Object.keys(data.individuals));
  }

  // Always include root person
  allowed.add(rootPersonId);

  // Find parents
  let fatherId: string | undefined;
  let motherId: string | undefined;

  for (const famId of root.familiesAsChild) {
    const fam = data.families[famId];
    if (fam) {
      if (fam.husbandId) fatherId = fam.husbandId;
      if (fam.wifeId) motherId = fam.wifeId;
    }
  }

  const startId = scope === 'paternal' ? fatherId : scope === 'maternal' ? motherId : rootPersonId;
  if (!startId) return allowed;

  // BFS / DFS to collect all ancestors and descendants along this line
  const queue = [startId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    allowed.add(currentId);

    const ind = data.individuals[currentId];
    if (!ind) continue;

    // Add ancestors
    for (const famId of ind.familiesAsChild) {
      const fam = data.families[famId];
      if (fam) {
        if (fam.husbandId && !visited.has(fam.husbandId)) queue.push(fam.husbandId);
        if (fam.wifeId && !visited.has(fam.wifeId)) queue.push(fam.wifeId);
      }
    }

    // Add immediate spouses and children for context
    for (const famId of ind.familiesAsSpouse) {
      const fam = data.families[famId];
      if (fam) {
        if (fam.husbandId && fam.husbandId !== currentId) allowed.add(fam.husbandId);
        if (fam.wifeId && fam.wifeId !== currentId) allowed.add(fam.wifeId);
        for (const childId of fam.childrenIds) {
          allowed.add(childId);
        }
      }
    }
  }

  return allowed;
}

export function filterGenealogyData(
  data: GenealogyData,
  rootPersonId: string,
  scope: BranchScope,
  hideLiving: boolean
): GenealogyData {
  const allowedIds = getBranchIndividuals(data, rootPersonId, scope);
  const privacyPolicy = { ...DEFAULT_PRIVACY_POLICY, hideLiving, hideUnknown: hideLiving };

  const filteredIndividuals: Record<string, Individual> = {};
  for (const [id, ind] of Object.entries(data.individuals)) {
    if (!allowedIds.has(id)) continue;

    if (hideLiving && shouldProtectPerson(ind, privacyPolicy, data)) {
      filteredIndividuals[id] = sanitizePersonForPrivacy(ind, privacyPolicy, data);
    } else {
      filteredIndividuals[id] = ind;
    }
  }

  const protectedIds = hideLiving ? getProtectedPersonIds(data, privacyPolicy) : new Set<string>();

  // Filter families where at least one member is visible and sanitize if involving protected persons
  const filteredFamilies: Record<string, Family> = {};
  for (const [fId, fam] of Object.entries(data.families)) {
    const husbVisible = fam.husbandId && allowedIds.has(fam.husbandId);
    const wifeVisible = fam.wifeId && allowedIds.has(fam.wifeId);
    const anyChildVisible = fam.childrenIds.some(cid => allowedIds.has(cid));

    if (husbVisible || wifeVisible || anyChildVisible) {
      const trimmedFamily: Family = {
        ...fam,
        childrenIds: fam.childrenIds.filter(cid => allowedIds.has(cid)),
      };
      filteredFamilies[fId] = hideLiving 
        ? sanitizeFamilyForPrivacy(trimmedFamily, protectedIds, privacyPolicy)
        : trimmedFamily;
    }
  }

  return {
    individuals: filteredIndividuals,
    families: filteredFamilies,
    rootPersonId: allowedIds.has(rootPersonId) ? rootPersonId : Object.keys(filteredIndividuals)[0],
    sourceHeader: data.sourceHeader,
  };
}
