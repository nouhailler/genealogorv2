import type { Individual, Family, GenealogyData } from '../types/genealogy';

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warn' | 'info';
  personId: string;
  personName: string;
  code: string;
  message: string;
}

export interface CompletenessField {
  field: string;
  label: string;
  count: number;
  total: number;
  pct: number;
}

export interface ValidationSummary {
  issues: ValidationIssue[];
  errorsCount: number;
  warningsCount: number;
  infosCount: number;
  completeness: CompletenessField[];
  overallCompletenessPct: number;
}

function resolvePerson(id: string, individuals: Record<string, Individual> | Map<string, Individual>): Individual | undefined {
  if (individuals instanceof Map) return individuals.get(id);
  return individuals[id];
}

function resolveFamily(id: string, families: Record<string, Family> | Map<string, Family>): Family | undefined {
  if (families instanceof Map) return families.get(id);
  return families[id];
}

function getYear(pDate?: { year?: number; raw?: string }, dateStr?: string): number | undefined {
  if (pDate?.year && !isNaN(pDate.year)) return pDate.year;
  if (dateStr) {
    const m = dateStr.match(/\b\d{4}\b/);
    if (m) return parseInt(m[0], 10);
  }
  return undefined;
}

export function runFullValidation(
  data: GenealogyData | { individuals: Record<string, Individual> | Map<string, Individual>; families: Record<string, Family> | Map<string, Family> },
): ValidationSummary {
  const issues: ValidationIssue[] = [];
  const individuals = data.individuals;
  const families = data.families;
  const personList = individuals instanceof Map ? Array.from(individuals.values()) : Object.values(individuals);
  const now = new Date().getFullYear();

  // 1. Ancestral cycle detection (DFS with visited set and recursion stack)
  const cycleIds = new Set<string>();
  for (const p of personList) {
    if (cycleIds.has(p.id)) continue;
    const stack: { id: string; depth: number }[] = [{ id: p.id, depth: 0 }];
    const visitedThisRun = new Set<string>([p.id]);
    let found = false;

    while (stack.length && !found) {
      const { id, depth } = stack.pop()!;
      if (depth > 50) continue;
      const cur = resolvePerson(id, individuals);
      if (!cur) continue;

      const childFams = cur.familiesAsChild || (cur as unknown as { famc?: string[] }).famc || [];
      for (const fid of childFams) {
        const fam = resolveFamily(fid, families);
        if (!fam) continue;
        const parents = [
          fam.husbandId || (fam as unknown as { husband?: string }).husband,
          fam.wifeId || (fam as unknown as { wife?: string }).wife,
        ].filter(Boolean) as string[];

        for (const parentId of parents) {
          if (parentId === p.id) {
            issues.push({
              id: `cycle-${p.id}`,
              severity: 'error',
              personId: p.id,
              personName: p.name,
              code: 'ancestral-cycle',
              message: `Cycle généalogique détecté : ${p.name} apparaît dans sa propre ascendance (${depth + 1} génération${depth + 1 > 1 ? 's' : ''}).`,
            });
            cycleIds.add(p.id);
            found = true;
            break;
          }
          if (visitedThisRun.has(parentId)) continue;
          visitedThisRun.add(parentId);
          stack.push({ id: parentId, depth: depth + 1 });
        }
        if (found) break;
      }
    }
  }

  // 2. Individual and parental consistency checks
  for (const p of personList) {
    const by = getYear(p.birth?.parsedDate, p.birth?.date);
    const dy = getYear(p.death?.parsedDate, p.death?.date);

    if (by && (by < 500 || by > now)) {
      issues.push({
        id: `implausible-birth-${p.id}`,
        severity: 'warn',
        personId: p.id,
        personName: p.name,
        code: 'implausible-birth',
        message: `Année de naissance improbable : ${by}`,
      });
    }

    if (by && dy && dy < by) {
      issues.push({
        id: `death-before-birth-${p.id}`,
        severity: 'error',
        personId: p.id,
        personName: p.name,
        code: 'death-before-birth',
        message: `Date de décès (${dy}) antérieure à la date de naissance (${by}).`,
      });
    }

    if (by && dy && dy - by > 120) {
      issues.push({
        id: `long-life-${p.id}`,
        severity: 'warn',
        personId: p.id,
        personName: p.name,
        code: 'long-life',
        message: `Longévité inhabituelle : ${dy - by} ans (> 120 ans).`,
      });
    }

    if (!p.name || p.name.trim() === '' || p.name === 'Inconnu') {
      issues.push({
        id: `no-name-${p.id}`,
        severity: 'warn',
        personId: p.id,
        personName: p.name || 'Sans nom',
        code: 'no-name',
        message: `Aucun nom ou prénom renseigné pour cette fiche.`,
      });
    }

    if (!by) {
      issues.push({
        id: `no-birth-${p.id}`,
        severity: 'info',
        personId: p.id,
        personName: p.name,
        code: 'no-birth-date',
        message: `Date de naissance manquante ou non précisée.`,
      });
    }

    // Check parents age when person was born
    const childFams = p.familiesAsChild || (p as unknown as { famc?: string[] }).famc || [];
    for (const fid of childFams) {
      const fam = resolveFamily(fid, families);
      if (!fam) continue;
      const parents = [
        { id: fam.husbandId || (fam as unknown as { husband?: string }).husband, role: 'père' },
        { id: fam.wifeId || (fam as unknown as { wife?: string }).wife, role: 'mère' },
      ];

      for (const { id: parentId, role } of parents) {
        if (!parentId) continue;
        const parent = resolvePerson(parentId, individuals);
        if (!parent) continue;

        const pby = getYear(parent.birth?.parsedDate, parent.birth?.date);
        const pdy = getYear(parent.death?.parsedDate, parent.death?.date);

        if (by && pby) {
          const ageAtChildBirth = by - pby;
          if (ageAtChildBirth < 12) {
            issues.push({
              id: `parent-too-young-${p.id}-${parentId}`,
              severity: 'error',
              personId: p.id,
              personName: p.name,
              code: 'parent-too-young',
              message: `Le ${role} (${parent.name}) avait seulement ${ageAtChildBirth} ans à la naissance de l'enfant.`,
            });
          }
          if (role === 'mère' && ageAtChildBirth > 55) {
            issues.push({
              id: `mother-too-old-${p.id}-${parentId}`,
              severity: 'warn',
              personId: p.id,
              personName: p.name,
              code: 'mother-too-old',
              message: `La mère (${parent.name}) avait ${ageAtChildBirth} ans à la naissance de l'enfant (> 55 ans).`,
            });
          }
          if (role === 'père' && ageAtChildBirth > 75) {
            issues.push({
              id: `father-too-old-${p.id}-${parentId}`,
              severity: 'warn',
              personId: p.id,
              personName: p.name,
              code: 'father-too-old',
              message: `Le père (${parent.name}) avait ${ageAtChildBirth} ans à la naissance de l'enfant (> 75 ans).`,
            });
          }
        }

        if (by && pdy) {
          if (role === 'mère' && by > pdy) {
            issues.push({
              id: `birth-after-mother-death-${p.id}-${parentId}`,
              severity: 'error',
              personId: p.id,
              personName: p.name,
              code: 'born-after-mother-death',
              message: `Naissance (${by}) postérieure au décès de la mère (${parent.name}, † ${pdy}).`,
            });
          } else if (role === 'père' && by > pdy + 1) {
            issues.push({
              id: `birth-after-father-death-${p.id}-${parentId}`,
              severity: 'warn',
              personId: p.id,
              personName: p.name,
              code: 'born-after-father-death',
              message: `Naissance (${by}) plus d'un an après le décès du père (${parent.name}, † ${pdy}).`,
            });
          }
        }
      }
    }

    // Check spouse families (marriages)
    const spouseFams = p.familiesAsSpouse || (p as unknown as { fams?: string[] }).fams || [];
    for (const fid of spouseFams) {
      const fam = resolveFamily(fid, families);
      if (!fam) continue;
      const my = getYear(fam.marriage?.parsedDate, fam.marriage?.date);
      if (my) {
        if (by && my < by) {
          issues.push({
            id: `marriage-before-birth-${p.id}-${fid}`,
            severity: 'error',
            personId: p.id,
            personName: p.name,
            code: 'marriage-before-birth',
            message: `Mariage (${my}) antérieur à la naissance (${by}).`,
          });
        }
        if (dy && my > dy) {
          issues.push({
            id: `marriage-after-death-${p.id}-${fid}`,
            severity: 'error',
            personId: p.id,
            personName: p.name,
            code: 'marriage-after-death',
            message: `Mariage (${my}) postérieur au décès (${dy}).`,
          });
        }
      }
    }
  }

  // 3. Completeness metrics
  const total = personList.length || 1;
  const countBirthDate = personList.filter((p) => !!getYear(p.birth?.parsedDate, p.birth?.date)).length;
  const countBirthPlace = personList.filter((p) => !!p.birth?.place?.trim()).length;
  const countDeathDate = personList.filter((p) => !!getYear(p.death?.parsedDate, p.death?.date)).length;
  const countDeathPlace = personList.filter((p) => !!p.death?.place?.trim()).length;
  const countOccupation = personList.filter((p) => (p.occupations && p.occupations.length > 0) || (p as unknown as { occupation?: string }).occupation).length;
  const countParents = personList.filter((p) => (p.familiesAsChild && p.familiesAsChild.length > 0) || (p as unknown as { famc?: string[] }).famc?.length).length;

  const completeness: CompletenessField[] = [
    { field: 'birthDate', label: 'Dates de naissance', count: countBirthDate, total, pct: Math.round((countBirthDate / total) * 100) },
    { field: 'birthPlace', label: 'Lieux de naissance', count: countBirthPlace, total, pct: Math.round((countBirthPlace / total) * 100) },
    { field: 'parents', label: 'Filiations parentales', count: countParents, total, pct: Math.round((countParents / total) * 100) },
    { field: 'deathDate', label: 'Dates de décès', count: countDeathDate, total, pct: Math.round((countDeathDate / total) * 100) },
    { field: 'deathPlace', label: 'Lieux de décès', count: countDeathPlace, total, pct: Math.round((countDeathPlace / total) * 100) },
    { field: 'occupation', label: 'Professions renseignées', count: countOccupation, total, pct: Math.round((countOccupation / total) * 100) },
  ];

  const overallCompletenessPct = Math.round(
    completeness.reduce((acc, c) => acc + c.pct, 0) / completeness.length,
  );

  return {
    issues,
    errorsCount: issues.filter((i) => i.severity === 'error').length,
    warningsCount: issues.filter((i) => i.severity === 'warn').length,
    infosCount: issues.filter((i) => i.severity === 'info').length,
    completeness,
    overallCompletenessPct,
  };
}

export const ValidationChecker = { runFullValidation };
