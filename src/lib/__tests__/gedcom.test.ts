import { describe, it, expect } from 'vitest';
import { parseGedcom, parseGedcomDate } from '../gedcom-parser';
import { serializeGedcomWithReport } from '../gedcom-serializer';

describe('Interopérabilité et Tests GEDCOM Multi-Logiciels (P1 - Exigence 5)', () => {
  const sampleGedcomRaw = `0 HEAD
1 SOUR Genealogor
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S1@ SOUR
1 TITL Registre Paroissial Saint-Vincent
1 AUTH Curé de Saint-Malo
0 @I1@ INDI
1 NAME François /Martin/
1 GIVN François
1 SURN Martin
1 SEX M
1 BIRT
2 DATE 14 MAY 1742
2 PLAC Saint-Malo, Ille-et-Vilaine
2 SOUR @S1@
1 DEAT
2 DATE 04 FEB 1818
2 PLAC Rennes
1 FAMS @F1@
1 NOTE Première ligne de note.
2 CONT Deuxième ligne de note.
0 @I2@ INDI
1 NAME Marie /Laurent/
1 GIVN Marie
1 SURN Laurent
1 SEX F
1 BIRT
2 DATE 15 APR 1766
1 FAMS @F1@
0 @I3@ INDI
1 NAME Jean-Baptiste /Martin/
1 GIVN Jean-Baptiste
1 SURN Martin
1 SEX M
1 BIRT
2 DATE 12 MAR 1795
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 18 BRUMAIRE AN II
2 PLAC Rennes
0 TRLR`;

  it('doit analyser correctement les individus, familles, sources et notes multilignes (CONT)', () => {
    const data = parseGedcom(sampleGedcomRaw);

    expect(Object.keys(data.individuals).length).toBe(3);
    expect(Object.keys(data.families).length).toBe(1);
    expect(data.sources?.['@S1@']?.title).toBe('Registre Paroissial Saint-Vincent');

    const francois = data.individuals['@I1@'];
    expect(francois.name).toBe('François Martin');
    expect(francois.birth?.date).toBe('14 MAY 1742');
    expect(francois.notes?.[0]).toContain('Première ligne de note.\nDeuxième ligne de note.');
  });

  it('doit préserver les données lors d\'un cycle import -> export -> import (Round-trip)', () => {
    const parsed1 = parseGedcom(sampleGedcomRaw);
    const { gedcom: exportedGedcom } = serializeGedcomWithReport(parsed1);
    const parsed2 = parseGedcom(exportedGedcom);

    expect(Object.keys(parsed2.individuals).length).toBe(Object.keys(parsed1.individuals).length);
    expect(Object.keys(parsed2.families).length).toBe(Object.keys(parsed1.families).length);

    expect(parsed2.individuals['@I1@'].name).toBe(parsed1.individuals['@I1@'].name);
    expect(parsed2.individuals['@I1@'].birth?.date).toBe(parsed1.individuals['@I1@'].birth?.date);
    expect(parsed2.families['@F1@'].childrenIds).toEqual(parsed1.families['@F1@'].childrenIds);
  });

  it('doit masquer les personnes vivantes lors de l\'export si l\'option hideLiving est activée', () => {
    const currentYear = new Date().getFullYear();
    const livingYear = currentYear - 25;
    const gedcomWithLiving = `0 HEAD
1 SOUR Genealogor
0 @I99@ INDI
1 NAME Thomas /Martin/
1 GIVN Thomas
1 SURN Martin
1 SEX M
1 BIRT
2 DATE 10 OCT ${livingYear}
0 TRLR`;

    const data = parseGedcom(gedcomWithLiving);
    const { gedcom: exportedGedcom, report } = serializeGedcomWithReport(data, { hideLiving: true });

    expect(report.maskedLivingCount).toBe(1);
    expect(exportedGedcom).toContain('Martin [Privé]');
    expect(exportedGedcom).not.toContain('Thomas');
  });

  it('gère les familles recomposées avec conjoints multiples et demi-frères/demi-sœurs', () => {
    const blendedGedcom = `0 HEAD
1 SOUR Heredis 2024
0 @I_FATHER@ INDI
1 NAME Henri /Martin/
1 SEX M
1 FAMS @FAM_1@
1 FAMS @FAM_2@
0 @I_WIFE1@ INDI
1 NAME Jeanne /Le Gall/
1 SEX F
1 FAMS @FAM_1@
0 @I_WIFE2@ INDI
1 NAME Louise /Moreau/
1 SEX F
1 FAMS @FAM_2@
0 @I_CHILD1@ INDI
1 NAME Pierre /Martin/
1 SEX M
1 FAMC @FAM_1@
0 @I_CHILD2@ INDI
1 NAME Suzanne /Martin/
1 SEX F
1 FAMC @FAM_2@
0 @FAM_1@ FAM
1 HUSB @I_FATHER@
1 WIFE @I_WIFE1@
1 CHIL @I_CHILD1@
0 @FAM_2@ FAM
1 HUSB @I_FATHER@
1 WIFE @I_WIFE2@
1 CHIL @I_CHILD2@
0 TRLR`;

    const parsed = parseGedcom(blendedGedcom);
    const father = parsed.individuals['@I_FATHER@'];
    expect(father.familiesAsSpouse).toEqual(['@FAM_1@', '@FAM_2@']);

    const child1 = parsed.individuals['@I_CHILD1@'];
    const child2 = parsed.individuals['@I_CHILD2@'];
    expect(child1.familiesAsChild).toContain('@FAM_1@');
    expect(child2.familiesAsChild).toContain('@FAM_2@');

    expect(parsed.families['@FAM_1@'].wifeId).toBe('@I_WIFE1@');
    expect(parsed.families['@FAM_2@'].wifeId).toBe('@I_WIFE2@');
  });

  it('analyse les dates approximatives en français et anglais (ABT, BET, VERS, AVANT, APRES)', () => {
    const d1 = parseGedcomDate('ABT 1820');
    expect(d1?.isApproximate).toBe(true);
    expect(d1?.year).toBe(1820);

    const d2 = parseGedcomDate('VERS 1785');
    expect(d2?.isApproximate).toBe(true);
    expect(d2?.year).toBe(1785);

    const d3 = parseGedcomDate('BET 1810 AND 1815');
    expect(d3?.isBetween).toBe(true);
    expect(d3?.year).toBe(1810);
    expect(d3?.year2).toBe(1815);

    const d4 = parseGedcomDate('AVANT 1850');
    expect(d4?.isBefore).toBe(true);
    expect(d4?.year).toBe(1850);

    const d5 = parseGedcomDate('APRES 1792');
    expect(d5?.isAfter).toBe(true);
    expect(d5?.year).toBe(1792);
  });

  it('extrait les médias (OBJE, FILE, TITL) et préserve les tags propriétaires (_UID, _FREL)', () => {
    const gedcomWithMediaAndVendorTags = `0 HEAD
1 SOUR Geneatique 2024
0 @I10@ INDI
1 NAME Alexandre /Dumas/
1 SEX M
1 OBJE
2 FILE portrait_dumas.jpg
2 TITL Portrait de l'écrivain
2 FORM jpg
1 _UID 4A91B0295F
1 _FREL Natural
0 TRLR`;

    const parsed = parseGedcom(gedcomWithMediaAndVendorTags);
    const dumas = parsed.individuals['@I10@'];

    expect(dumas.media?.length).toBe(1);
    expect(dumas.media?.[0].file).toBe('portrait_dumas.jpg');
    expect(dumas.media?.[0].title).toBe("Portrait de l'écrivain");
    expect(dumas.media?.[0].format).toBe('jpg');

    // Vérifier la préservation des tags non supportés sans perte silencieuse
    expect(dumas._unsupportedTags?.some(t => t.tag === '_UID')).toBe(true);
    expect(dumas._unsupportedTags?.some(t => t.tag === '_FREL')).toBe(true);
  });

  describe('Tests multi-logiciels généalogiques (Geneanet, Heredis, Gramps, FTM)', () => {
    it('traite fidèlement un export Geneanet avec sources détaillées, cotes, pages et notes avec concaténation CONC/CONT', () => {
      const geneanetGedcom = `0 HEAD
1 SOUR GENEANET
2 VERS 2024
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @S_GENEANET@ SOUR
1 TITL Registres paroissiaux et d'état civil de Bretagne
1 AUTH Archives Départementales d'Ille-et-Vilaine
1 PUBL En ligne sur archinoe
1 NOTE Fonds numérisé des registres anciens
0 @I_GEN1@ INDI
1 NAME Émile /Zola/
1 GIVN Émile
1 SURN Zola
1 SEX M
1 BIRT
2 DATE 02 APR 1840
2 PLAC Paris, 75000, Île-de-France, France
2 SOUR @S_GENEANET@
3 PAGE Vue 15/48, acte n° 312
3 NOTE Mention marginale très lisible
1 OCCU Écrivain et journaliste
1 NOTE Ceci est une note très longue qui commence sur Geneanet et
2 CONC  se poursuit sur la même ligne grâce au tag CONC,
2 CONT puis saute une ligne grâce au tag CONT.
1 FAMS @FAM_GEN1@
0 @I_GEN2@ INDI
1 NAME Alexandrine /Méley/
1 GIVN Alexandrine
1 SURN Méley
1 SEX F
1 BIRT
2 DATE 23 MAR 1839
2 PLAC Paris, France
1 FAMS @FAM_GEN1@
0 @FAM_GEN1@ FAM
1 HUSB @I_GEN1@
1 WIFE @I_GEN2@
1 MARR
2 DATE 31 MAY 1870
2 PLAC Paris 17e, France
2 SOUR @S_GENEANET@
3 PAGE Acte n° 456
1 NOTE Mariage célébré civilement
0 TRLR`;

      const parsed = parseGedcom(geneanetGedcom);
      expect(parsed.sources?.['@S_GENEANET@']).toBeDefined();
      expect(parsed.sources?.['@S_GENEANET@']?.title).toBe("Registres paroissiaux et d'état civil de Bretagne");
      expect(parsed.sources?.['@S_GENEANET@']?.author).toBe("Archives Départementales d'Ille-et-Vilaine");

      const zola = parsed.individuals['@I_GEN1@'];
      expect(zola).toBeDefined();
      expect(zola.name).toBe('Émile Zola');
      expect(zola.occupations).toContain('Écrivain et journaliste');
      expect(zola.birth?.citations?.[0]?.sourceId).toBe('@S_GENEANET@');
      expect(zola.birth?.citations?.[0]?.page).toBe('Vue 15/48, acte n° 312');

      // Vérifier le traitement de CONC (concaténation sur même ligne) et CONT (saut de ligne)
      expect(zola.notes?.[0]).toContain('se poursuit sur la même ligne');
      expect(zola.notes?.[0]).toContain('\npuis saute une ligne');

      // Vérifier la famille et le mariage
      const fam = parsed.families['@FAM_GEN1@'];
      expect(fam).toBeDefined();
      expect(fam.husbandId).toBe('@I_GEN1@');
      expect(fam.wifeId).toBe('@I_GEN2@');
      expect(fam.marriage?.date).toBe('31 MAY 1870');
      expect(fam.marriage?.citations?.[0]?.page).toBe('Acte n° 456');
    });

    it('traite un export Gramps avec médias multiples (OBJE), événements spécifiques et liens familiaux réciproques', () => {
      const grampsGedcom = `0 HEAD
1 SOUR GRAMPS
2 VERS 5.1.5
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I_GRAMPS1@ INDI
1 NAME Victor /Hugo/
1 SEX M
1 BIRT
2 DATE 26 FEB 1802
2 PLAC Besançon, Doubs, Franche-Comté, France
1 DEAT
2 DATE 22 MAY 1885
2 PLAC Paris, France
1 OBJE
2 FILE https://archives.example.com/hugo.jpg
2 FORM image/jpeg
2 TITL Portrait officiel Victor Hugo
1 OBJE
2 FILE /documents/testament_hugo.pdf
2 FORM application/pdf
2 TITL Testament olographe
1 FAMS @FAM_GRAMPS1@
0 @I_GRAMPS2@ INDI
1 NAME Adèle /Foucher/
1 SEX F
1 BIRT
2 DATE 27 SEP 1803
2 PLAC Paris, France
1 FAMS @FAM_GRAMPS1@
0 @I_GRAMPS3@ INDI
1 NAME Léopoldine /Hugo/
1 SEX F
1 BIRT
2 DATE 28 AUG 1824
2 PLAC Paris, France
1 DEAT
2 DATE 04 SEP 1843
2 PLAC Villequier, Seine-Maritime, France
1 FAMC @FAM_GRAMPS1@
0 @FAM_GRAMPS1@ FAM
1 HUSB @I_GRAMPS1@
1 WIFE @I_GRAMPS2@
1 CHIL @I_GRAMPS3@
1 MARR
2 DATE 12 OCT 1822
2 PLAC Paris, France
0 TRLR`;

      const parsed = parseGedcom(grampsGedcom);
      const hugo = parsed.individuals['@I_GRAMPS1@'];
      expect(hugo).toBeDefined();
      expect(hugo.media?.length).toBe(2);
      expect(hugo.media?.[0].file).toBe('https://archives.example.com/hugo.jpg');
      expect(hugo.media?.[0].title).toBe('Portrait officiel Victor Hugo');
      expect(hugo.media?.[1].format).toBe('application/pdf');

      // Vérifier les relations réciproques parents-enfant
      const leopoldine = parsed.individuals['@I_GRAMPS3@'];
      expect(leopoldine.familiesAsChild).toContain('@FAM_GRAMPS1@');

      const fam = parsed.families['@FAM_GRAMPS1@'];
      expect(fam.husbandId).toBe('@I_GRAMPS1@');
      expect(fam.wifeId).toBe('@I_GRAMPS2@');
      expect(fam.childrenIds).toContain('@I_GRAMPS3@');

      // Vérifier la cohérence de l'export
      const { gedcom: reExported } = serializeGedcomWithReport(parsed);
      expect(reExported).toContain('Victor /Hugo/');
      expect(reExported.toUpperCase()).toContain('portrait officiel victor hugo'.toUpperCase());
    });
  });
});

