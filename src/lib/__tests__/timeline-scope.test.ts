import { describe, it, expect } from 'vitest';
import { parseGedcom, parseGedcomDate } from '../gedcom-parser';
import { getLineageDepths, relationLabel, ageAtDeath } from '../timeline-scope';
import { Individual } from '../../types/genealogy';

const lived = (birth?: string, death?: string): Individual => ({
  id: '@X@', name: 'X', sex: 'M', familiesAsChild: [], familiesAsSpouse: [],
  birth: birth ? { date: birth, parsedDate: parseGedcomDate(birth) } : undefined,
  death: death ? { date: death, parsedDate: parseGedcomDate(death) } : undefined,
});

// Jean (@I4@) → Henri (@I2@) + Marie (@I3@) → Gabrielle (@I1@) → Patrick (@I5@)
const GED = `0 HEAD
0 @I1@ INDI
1 NAME Gabrielle /Coste/
1 SEX F
1 FAMC @F1@
1 FAMS @F3@
0 @I2@ INDI
1 NAME Henri /Coste/
1 SEX M
1 FAMS @F1@
1 FAMC @F2@
0 @I3@ INDI
1 NAME Marie /Palem/
1 SEX F
1 FAMS @F1@
0 @I4@ INDI
1 NAME Jean /Coste/
1 SEX M
1 FAMS @F2@
0 @I5@ INDI
1 NAME Patrick /Nouhailler/
1 SEX M
1 FAMC @F3@
0 @I6@ INDI
1 NAME Raymonde /Coste/
1 SEX F
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
1 CHIL @I6@
0 @F2@ FAM
1 HUSB @I4@
1 CHIL @I2@
0 @F3@ FAM
1 WIFE @I1@
1 CHIL @I5@
0 TRLR
`;
const data = parseGedcom(GED);

describe('Chronologie depuis une fiche (ascendants / descendants)', () => {
  it('retient la personne et ses ascendants avec leur distance, sans la fratrie', () => {
    const depths = getLineageDepths(data, '@I1@', 'ascendants');
    expect(Object.fromEntries(depths)).toEqual({ '@I1@': 0, '@I2@': 1, '@I3@': 1, '@I4@': 2 });
  });

  it('retient la personne et ses descendants avec une distance négative', () => {
    const depths = getLineageDepths(data, '@I4@', 'descendants');
    expect(Object.fromEntries(depths)).toEqual({ '@I4@': 0, '@I2@': -1, '@I1@': -2, '@I6@': -2, '@I5@': -3 });
  });

  it('renvoie un périmètre vide pour une personne inconnue', () => {
    expect(getLineageDepths(data, '@INCONNU@', 'ascendants').size).toBe(0);
  });

  it('nomme le lien de parenté selon la génération et le sexe', () => {
    expect(relationLabel(0, 'F')).toBe('Personne de référence');
    expect(relationLabel(1, 'M')).toBe('Père');
    expect(relationLabel(2, 'F')).toBe('Grand-mère');
    expect(relationLabel(3, 'M')).toBe('Arrière-grand-père');
    expect(relationLabel(5, 'F')).toBe('Ancêtre · 5e génération');
    expect(relationLabel(-1, 'F')).toBe('Fille');
    expect(relationLabel(-2, 'M')).toBe('Petit-fils');
    expect(relationLabel(-3, 'X')).toBe('Arrière-petit-enfant');
    expect(relationLabel(-4, 'M')).toBe('Descendant · 4e génération');
  });

  it('calcule l\'âge exact au décès quand les dates sont complètes', () => {
    expect(ageAtDeath(lived('16 NOV 1905', '19 OCT 1982'))).toBe('à 76 ans');
    expect(ageAtDeath(lived('16 NOV 1905', '16 NOV 1982'))).toBe('à 77 ans');
    expect(ageAtDeath(lived('10 JAN 1890', '25 APR 1890'))).toBe('à 3 mois');
    expect(ageAtDeath(lived('10 JAN 1890', '22 JAN 1890'))).toBe('à 12 jours');
    expect(ageAtDeath(lived('10 JAN 1890', '10 JAN 1890'))).toBe('le jour de sa naissance');
  });

  it('donne un âge approché avec les années seules ou une date approximative', () => {
    expect(ageAtDeath(lived('1905', '1982'))).toBe('vers 77 ans');
    expect(ageAtDeath(lived('ABT 1780', '12 MAR 1850'))).toBe('vers 70 ans');
    expect(ageAtDeath(lived('1890', '1890'))).toBe('avant 1 an');
  });

  it('n\'affiche rien si l\'âge ne peut pas être établi', () => {
    expect(ageAtDeath(lived('16 NOV 1905'))).toBeUndefined();
    expect(ageAtDeath(lived(undefined, '1982'))).toBeUndefined();
    expect(ageAtDeath(lived('BEF 1800', '1850'))).toBeUndefined();
    expect(ageAtDeath(lived('1905', 'BET 1980 AND 1985'))).toBeUndefined();
    expect(ageAtDeath(lived('1950', '1900'))).toBeUndefined();
  });
});
