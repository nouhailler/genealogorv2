import { GenealogyData, ChronologicalAnomaly, Individual } from '../types/genealogy';

/**
 * Valide la cohérence chronologique de l'arbre généalogique et détecte les anomalies probables
 * de manière non bloquante avec explication détaillée.
 */
export function validateChronology(data: GenealogyData): ChronologicalAnomaly[] {
  const anomalies: ChronologicalAnomaly[] = [];

  for (const person of Object.values(data.individuals)) {
    const birthYear = person.birth?.parsedDate?.year;
    const deathYear = person.death?.parsedDate?.year;

    // 1. Décès antérieur à la naissance
    if (birthYear && deathYear && deathYear < birthYear) {
      anomalies.push({
        id: `anom-death-before-birth-${person.id}`,
        personId: person.id,
        personName: person.name,
        severity: 'error',
        code: 'DEATH_BEFORE_BIRTH',
        message: `Date de décès (${person.death?.date}) antérieure à la naissance (${person.birth?.date}).`,
      });
    }

    // 2. Contrôle d'âge parental aux naissances des enfants
    for (const famId of person.familiesAsSpouse) {
      const fam = data.families[famId];
      if (!fam) continue;

      // Mariage avant 12 ans
      const marriageYear = fam.marriage?.parsedDate?.year;
      if (birthYear && marriageYear && marriageYear - birthYear < 12) {
        anomalies.push({
          id: `anom-marriage-early-${person.id}-${fam.id}`,
          personId: person.id,
          personName: person.name,
          severity: 'warning',
          code: 'MARRIAGE_BEFORE_BIRTH',
          message: `Mariage en ${fam.marriage?.date} alors que la personne avait moins de 12 ans.`,
        });
      }

      // Événement après décès
      if (deathYear && marriageYear && marriageYear > deathYear) {
        anomalies.push({
          id: `anom-marr-after-death-${person.id}-${fam.id}`,
          personId: person.id,
          personName: person.name,
          severity: 'error',
          code: 'EVENT_AFTER_DEATH',
          message: `Mariage en ${fam.marriage?.date} postérieur au décès (${person.death?.date}).`,
        });
      }

      for (const childId of fam.childrenIds) {
        const child = data.individuals[childId];
        const childBirthYear = child?.birth?.parsedDate?.year;
        if (!child || !childBirthYear || !birthYear) continue;

        const parentAgeAtChildBirth = childBirthYear - birthYear;

        // Parent trop jeune (< 12 ans)
        if (parentAgeAtChildBirth < 12) {
          anomalies.push({
            id: `anom-parent-too-young-${person.id}-${child.id}`,
            personId: person.id,
            personName: person.name,
            severity: 'error',
            code: 'PARENT_TOO_YOUNG',
            message: `${person.name} (° ${person.birth?.date}) aurait eu ${parentAgeAtChildBirth} ans à la naissance de son enfant ${child.name} (° ${child.birth?.date}) : vérifiez l'une des deux dates de naissance.`,
          });
        }

        // Mère trop âgée (> 55 ans)
        if (person.sex === 'F' && parentAgeAtChildBirth > 55) {
          anomalies.push({
            id: `anom-mother-too-old-${person.id}-${child.id}`,
            personId: person.id,
            personName: person.name,
            severity: 'warning',
            code: 'PARENT_TOO_OLD',
            message: `Mère âgée de ${parentAgeAtChildBirth} ans à la naissance de ${child.name}.`,
          });
        }

        // Père trop âgé (> 80 ans)
        if (person.sex === 'M' && parentAgeAtChildBirth > 80) {
          anomalies.push({
            id: `anom-father-too-old-${person.id}-${child.id}`,
            personId: person.id,
            personName: person.name,
            severity: 'warning',
            code: 'PARENT_TOO_OLD',
            message: `Père âgé de ${parentAgeAtChildBirth} ans à la naissance de ${child.name}.`,
          });
        }
      }
    }
  }

  return anomalies;
}

/**
 * Détecte les cycles interdits dans les relations parent-enfant (ex: A parent de B parent de A).
 */
export function detectRelationshipCycles(data: GenealogyData): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(currentId: string, path: string[]) {
    visited.add(currentId);
    recursionStack.add(currentId);
    path.push(currentId);

    const person = data.individuals[currentId];
    if (person) {
      // Trouver tous les enfants
      for (const famId of person.familiesAsSpouse) {
        const fam = data.families[famId];
        if (fam) {
          for (const childId of fam.childrenIds) {
            if (!visited.has(childId)) {
              dfs(childId, [...path]);
            } else if (recursionStack.has(childId)) {
              // Cycle détecté
              cycles.push([...path, childId]);
            }
          }
        }
      }
    }

    recursionStack.delete(currentId);
  }

  for (const personId of Object.keys(data.individuals)) {
    if (!visited.has(personId)) {
      dfs(personId, []);
    }
  }

  return cycles;
}
