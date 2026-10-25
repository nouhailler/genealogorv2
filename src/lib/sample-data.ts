import { GenealogyData, Individual, Family, ArchiveDocument } from '../types/genealogy';
import { parseGedcomDate } from './gedcom-parser';

export function getSampleGenealogy(): GenealogyData {
  const individuals: Record<string, Individual> = {
    '@I1@': {
      id: '@I1@',
      name: 'François Martin',
      givenName: 'François',
      surname: 'Martin',
      sex: 'M',
      birth: {
        date: '14 MAY 1742',
        place: 'Saint-Malo, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('14 MAY 1742'),
        notes: ['Baptisé en la paroisse Saint-Vincent de Saint-Malo.'],
      },
      death: {
        date: '04 FEB 1818',
        place: 'Rennes, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('04 FEB 1818'),
        notes: ['Décédé à l\'âge de 75 ans à son domicile rue Saint-Georges.'],
      },
      occupations: ['Marinier', 'Maître de cabotage'],
      familiesAsChild: ['@F1@'],
      familiesAsSpouse: ['@F2@'],
      sosaNumber: 1,
      notes: ['A navigué en mer d\'Iroise et participé au commerce maritime breton.'],
    },
    '@I2@': {
      id: '@I2@',
      name: 'Pierre Martin',
      givenName: 'Pierre',
      surname: 'Martin',
      sex: 'M',
      birth: {
        date: '28 OCT 1715',
        place: 'Dinan, Côtes-d\'Armor, Bretagne, France',
        parsedDate: parseGedcomDate('28 OCT 1715'),
      },
      death: {
        date: '17 AUG 1782',
        place: 'Saint-Malo, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('17 AUG 1782'),
      },
      occupations: ['Maître charpentier de marine'],
      familiesAsChild: ['@F3@'],
      familiesAsSpouse: ['@F1@'],
      sosaNumber: 2,
    },
    '@I3@': {
      id: '@I3@',
      name: 'Jeanne Le Galloudec',
      givenName: 'Jeanne',
      surname: 'Le Galloudec',
      sex: 'F',
      birth: {
        date: '12 MAR 1718',
        place: 'Cancale, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('12 MAR 1718'),
      },
      death: {
        date: '22 NOV 1790',
        place: 'Saint-Malo, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('22 NOV 1790'),
      },
      occupations: ['Fileuse de lin'],
      familiesAsChild: ['@F4@'],
      familiesAsSpouse: ['@F1@'],
      sosaNumber: 3,
    },
    '@I4@': {
      id: '@I4@',
      name: 'Marie Laurent',
      givenName: 'Marie',
      surname: 'Laurent',
      sex: 'F',
      birth: {
        date: '15 APR 1766',
        place: 'Rennes, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('15 APR 1766'),
      },
      death: {
        date: '30 JAN 1839',
        place: 'Rennes, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('30 JAN 1839'),
      },
      occupations: ['Tailleuse d\'habits'],
      familiesAsChild: [],
      familiesAsSpouse: ['@F2@'],
      notes: ['Mariage célébré sous la Révolution (Brumaire an II).'],
    },
    '@I5@': {
      id: '@I5@',
      name: 'Guillaume Martin',
      givenName: 'Guillaume',
      surname: 'Martin',
      sex: 'M',
      birth: {
        date: '10 MAY 1685',
        place: 'Dinan, Côtes-d\'Armor, Bretagne, France',
        parsedDate: parseGedcomDate('10 MAY 1685'),
      },
      death: {
        date: '14 JUN 1749',
        place: 'Dinan, Côtes-d\'Armor, Bretagne, France',
        parsedDate: parseGedcomDate('14 JUN 1749'),
      },
      occupations: ['Forgeron', 'Maréchal-ferrant'],
      familiesAsChild: [],
      familiesAsSpouse: ['@F3@'],
      sosaNumber: 4,
    },
    '@I6@': {
      id: '@I6@',
      name: 'Françoise Briand',
      givenName: 'Françoise',
      surname: 'Briand',
      sex: 'F',
      birth: {
        date: '03 SEP 1689',
        place: 'Dinan, Côtes-d\'Armor, Bretagne, France',
        parsedDate: parseGedcomDate('03 SEP 1689'),
      },
      death: {
        date: '18 APR 1754',
        place: 'Dinan, Côtes-d\'Armor, Bretagne, France',
        parsedDate: parseGedcomDate('18 APR 1754'),
      },
      familiesAsChild: [],
      familiesAsSpouse: ['@F3@'],
      sosaNumber: 5,
    },
    '@I7@': {
      id: '@I7@',
      name: 'Jean Le Galloudec',
      givenName: 'Jean',
      surname: 'Le Galloudec',
      sex: 'M',
      birth: {
        date: 'ABT 1680',
        place: 'Cancale, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('ABT 1680'),
      },
      death: {
        date: '12 DEC 1745',
        place: 'Cancale, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('12 DEC 1745'),
      },
      occupations: ['Pêcheur terre-neuvas'],
      familiesAsChild: [],
      familiesAsSpouse: ['@F4@'],
      sosaNumber: 6,
    },
    '@I8@': {
      id: '@I8@',
      name: 'Yvonne Helleux',
      givenName: 'Yvonne',
      surname: 'Helleux',
      sex: 'F',
      birth: {
        date: '20 JUN 1685',
        place: 'Cancale, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('20 JUN 1685'),
      },
      death: {
        date: '08 OCT 1751',
        place: 'Cancale, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('08 OCT 1751'),
      },
      familiesAsChild: [],
      familiesAsSpouse: ['@F4@'],
      sosaNumber: 7,
    },
    '@I9@': {
      id: '@I9@',
      name: 'Jean-Baptiste Martin',
      givenName: 'Jean-Baptiste',
      surname: 'Martin',
      sex: 'M',
      birth: {
        date: '12 MAR 1795',
        place: 'Rennes, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('12 MAR 1795'),
      },
      death: {
        date: '19 NOV 1872',
        place: 'Nantes, Loire-Atlantique, France',
        parsedDate: parseGedcomDate('19 NOV 1872'),
      },
      occupations: ['Armateur', 'Négociant'],
      familiesAsChild: ['@F2@'],
      familiesAsSpouse: ['@F5@'],
    },
    '@I10@': {
      id: '@I10@',
      name: 'Anne-Sophie Dupuis',
      givenName: 'Anne-Sophie',
      surname: 'Dupuis',
      sex: 'F',
      birth: {
        date: '04 JUL 1802',
        place: 'Nantes, Loire-Atlantique, France',
        parsedDate: parseGedcomDate('04 JUL 1802'),
      },
      death: {
        date: '15 MAY 1880',
        place: 'Nantes, Loire-Atlantique, France',
        parsedDate: parseGedcomDate('15 MAY 1880'),
      },
      familiesAsChild: [],
      familiesAsSpouse: ['@F5@'],
    },
    '@I11@': {
      id: '@I11@',
      name: 'Henri Martin',
      givenName: 'Henri',
      surname: 'Martin',
      sex: 'M',
      birth: {
        date: '21 AUG 1835',
        place: 'Nantes, Loire-Atlantique, France',
        parsedDate: parseGedcomDate('21 AUG 1835'),
      },
      death: {
        date: '02 APR 1910',
        place: 'Paris, Île-de-France, France',
        parsedDate: parseGedcomDate('02 APR 1910'),
      },
      occupations: ['Professeur d\'histoire', 'Érudit local'],
      familiesAsChild: ['@F5@'],
      familiesAsSpouse: [],
    },
  };

  const families: Record<string, Family> = {
    '@F1@': {
      id: '@F1@',
      husbandId: '@I2@',
      wifeId: '@I3@',
      childrenIds: ['@I1@'],
      marriage: {
        date: '07 JAN 1740',
        place: 'Saint-Malo, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('07 JAN 1740'),
      },
      notes: ['Contrat de mariage passé devant Maître Corbel, notaire royal.'],
    },
    '@F2@': {
      id: '@F2@',
      husbandId: '@I1@',
      wifeId: '@I4@',
      childrenIds: ['@I9@'],
      marriage: {
        date: '18 BRUMAIRE AN II',
        place: 'Rennes, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('18 BRUMAIRE AN II'),
      },
    },
    '@F3@': {
      id: '@F3@',
      husbandId: '@I5@',
      wifeId: '@I6@',
      childrenIds: ['@I2@'],
      marriage: {
        date: '14 FEB 1712',
        place: 'Dinan, Côtes-d\'Armor, Bretagne, France',
        parsedDate: parseGedcomDate('14 FEB 1712'),
      },
    },
    '@F4@': {
      id: '@F4@',
      husbandId: '@I7@',
      wifeId: '@I8@',
      childrenIds: ['@I3@'],
      marriage: {
        date: '20 NOV 1710',
        place: 'Cancale, Ille-et-Vilaine, Bretagne, France',
        parsedDate: parseGedcomDate('20 NOV 1710'),
      },
    },
    '@F5@': {
      id: '@F5@',
      husbandId: '@I9@',
      wifeId: '@I10@',
      childrenIds: ['@I11@'],
      marriage: {
        date: '15 SEP 1828',
        place: 'Nantes, Loire-Atlantique, France',
        parsedDate: parseGedcomDate('15 SEP 1828'),
      },
    },
  };

  return {
    individuals,
    families,
    rootPersonId: '@I1@',
    sourceHeader: 'Arbre Généalogique de la Famille Martin (Bretagne)',
  };
}

export function createEmptyGenealogy(title = 'Mon Arbre Généalogique'): GenealogyData {
  return {
    individuals: {},
    families: {},
    rootPersonId: undefined,
    sourceHeader: title,
  };
}

export function isSampleGenealogy(_data?: GenealogyData | null, _archives?: ArchiveDocument[] | null): boolean {
  return false;
}
