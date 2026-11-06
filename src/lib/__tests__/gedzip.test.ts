import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../gedcom-parser';
import {
  buildGedzip,
  readGedzip,
  tagToCrop,
  parseGedcomNodes,
  dataUrlToBytes,
  bytesToDataUrl,
  GEDZIP_DATASET,
  MeasureImage,
} from '../gedzip';
import { createZip, readZip } from '../zip';
import { ArchiveDocument } from '../../types/genealogy';

// @I1@ née en 1995 (vivante), @I2@ et @I3@ décédés, mariés (@F1@)
const GED = `0 HEAD
0 @I1@ INDI
1 NAME Gabrielle /Coste/
1 SEX F
1 BIRT
2 DATE 1995
1 FAMC @F1@
0 @I2@ INDI
1 NAME Henri /Coste/
1 SEX M
1 BIRT
2 DATE 1905
1 DEAT
2 DATE 1982
1 FAMS @F1@
0 @I3@ INDI
1 NAME Marie /Palem/
1 SEX F
1 BIRT
2 DATE 1910
1 DEAT
2 DATE 1990
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 TRLR`;
const data = parseGedcom(GED);

const bytesOf = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 256);
const PHOTO = bytesToDataUrl(bytesOf(5000, 1), 'image/jpeg');
const SCAN = bytesToDataUrl(bytesOf(3000, 7), 'application/pdf');
const DIMS = { width: 2000, height: 1000 };
const measure: MeasureImage = async url => (url.startsWith('data:image/') ? DIMS : null);

const archives: ArchiveDocument[] = [
  {
    id: 'doc-mariage', title: 'Mariage Coste – Palem', type: 'photo', date: '1935', place: 'Tulle',
    fileData: PHOTO, mimeType: 'image/jpeg', fileName: 'mariage.jpg',
    notes: 'Remarque\nsur deux lignes', transcription: 'Au dos : « 12 juin 1935 »',
    linkedPersonIds: ['@I2@'], linkedFamilyIds: ['@F1@'],
    photoTags: [
      { id: 't1', personId: '@I2@', x: 40.5, y: 50.25, label: 'Le marié', confidence: 'certain' },
      { id: 't2', personId: '@I3@', x: 99, y: 2, width: 10, height: 20, label: '@Marie au bord' },
      { id: 't3', personId: '@I1@', x: 60, y: 60, label: 'Au premier rang' },
    ],
    createdAt: 1, updatedAt: 2,
  },
  {
    id: 'doc-acte', title: 'Acte de naissance', type: 'birth', callNumber: '3 E 142/12', archiveLocation: 'AD Corrèze',
    fileData: SCAN, mimeType: 'application/pdf', linkedPersonIds: ['@I2@'], linkedFamilyIds: [], createdAt: 3, updatedAt: 4,
  },
  {
    id: 'doc-ailleurs', title: 'Sans fichier ici', type: 'photo', mimeType: 'image/jpeg',
    linkedPersonIds: [], linkedFamilyIds: [], createdAt: 5, updatedAt: 6,
  },
];

describe('export GEDZIP', () => {
  it('produit un ZIP avec gedcom.ged et les fichiers, en GEDCOM 7 valide', async () => {
    const { bytes, gedcom, report } = await buildGedzip({ data, archives, measure });
    const files = await readZip(bytes);
    expect([...files.keys()]).toEqual([GEDZIP_DATASET, 'media/001-mariage-coste-palem.jpg', 'media/002-acte-de-naissance.pdf']);
    expect(files.get('media/001-mariage-coste-palem.jpg')).toEqual(dataUrlToBytes(PHOTO).bytes);

    const lines = gedcom.split('\n');
    expect(lines.slice(0, 3)).toEqual(['0 HEAD', '1 GEDC', '2 VERS 7.0']);
    expect(gedcom).toContain('1 SCHMA');
    expect(gedcom).toMatch(/2 TAG _GN_POS https:\/\/\S+/);
    expect(gedcom).not.toMatch(/ CONC |^1 CHAR|LINEAGE-LINKED/m);
    expect(lines[lines.length - 1]).toBe('0 TRLR');
    expect(gedcom).toMatch(/^1 DATE \d{1,2} (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) \d{4}$/m);

    // Enregistrement multimédia
    expect(gedcom).toContain('0 @O1@ OBJE\n1 FILE media/001-mariage-coste-palem.jpg\n2 FORM image/jpeg\n3 MEDI PHOTO\n2 TITL Mariage Coste – Palem');
    expect(gedcom).toContain('2 FORM application/pdf\n3 MEDI MANUSCRIPT');
    // Valeur commençant par @ échappée, texte multiligne en CONT
    expect(gedcom).toContain('2 TITL @@Marie au bord');
    expect(gedcom).toContain('1 _GN_NOTE Remarque\n2 CONT sur deux lignes');

    expect(report).toMatchObject({ mediaFiles: 2, photoTags: 3, personLinks: 2 });
    expect(report.skipped.map(a => a.id)).toEqual(['doc-ailleurs']);
  });

  it('place les zones CROP en pixels, dans l\'image, dans la fiche de chaque personne', async () => {
    const { gedcom } = await buildGedzip({ data, archives, measure });
    const nodes = parseGedcomNodes(gedcom);
    const henri = nodes.find(n => n.xref === '@I2@')!;
    const links = henri.children.filter(c => c.tag === 'OBJE');
    expect(links.map(l => l.value)).toEqual(['@O1@', '@O1@', '@O2@']); // lien simple et repère sur la photo, acte
    const tagged = links[1];
    const crop = tagged.children.find(c => c.tag === 'CROP')!;
    const val = (t: string) => Number(crop.children.find(c => c.tag === t)!.value);
    // Centre (810, 502.5) ; carré de 10 % du petit côté = 100 px
    expect({ left: val('LEFT'), top: val('TOP'), width: val('WIDTH'), height: val('HEIGHT') })
      .toEqual({ left: 760, top: 452, width: 100, height: 100 });
    expect(tagged.children.find(c => c.tag === 'TITL')!.value).toBe('Le marié');
    // Famille liée au document
    expect(nodes.find(n => n.xref === '@F1@')!.children.some(c => c.tag === 'OBJE' && c.value === '@O1@')).toBe(true);
  });

  it('masque les vivants selon la règle de l\'application : une photo où figure un vivant est exclue', async () => {
    const { gedcom, report } = await buildGedzip({ data, archives, measure, hideLiving: true });
    const gabrielle = parseGedcomNodes(gedcom).find(n => n.xref === '@I1@')!;
    expect(gabrielle.children.some(c => c.tag === 'OBJE')).toBe(false);
    expect(gedcom).not.toContain('Au premier rang');
    expect(gedcom).not.toContain('Gabrielle');
    expect(gedcom).not.toContain('Mariage Coste');
    expect(report).toMatchObject({ mediaFiles: 1, photoTags: 0, maskedLiving: 1 });
  });

  it('un document mixte garde les repères des défunts et retire ceux des vivants', async () => {
    const acteMixte: ArchiveDocument = { ...archives[1], photoTags: [
      { id: 'a', personId: '@I2@', x: 10, y: 10 }, { id: 'b', personId: '@I1@', x: 20, y: 20 },
    ], fileData: PHOTO, mimeType: 'image/jpeg', type: 'notarial' };
    const { report, gedcom } = await buildGedzip({ data, archives: [acteMixte], measure, hideLiving: true });
    expect(report.photoTags).toBe(1);
    expect(parseGedcomNodes(gedcom).find(n => n.xref === '@I1@')!.children.some(c => c.tag === 'OBJE')).toBe(false);
  });
});

describe('tagToCrop', () => {
  it('reste dans l\'image sans décaler le centre au bord', () => {
    const c = tagToCrop({ id: 't', personId: 'p', x: 99, y: 2, width: 10, height: 20 }, DIMS);
    expect(c.left + c.width).toBeLessThanOrEqual(DIMS.width);
    expect(c.top + c.height).toBeLessThanOrEqual(DIMS.height);
    expect(c.left).toBeGreaterThanOrEqual(0);
    expect(c.top).toBeGreaterThanOrEqual(0);
    expect((c.left + c.width / 2) / DIMS.width * 100).toBeCloseTo(99, 0);
    expect((c.top + c.height / 2) / DIMS.height * 100).toBeCloseTo(2, 0);
  });

  it('donne au moins un pixel sur un repère collé au coin', () => {
    const c = tagToCrop({ id: 't', personId: 'p', x: 100, y: 0 }, DIMS);
    expect(c).toEqual({ top: 0, left: 1999, width: 1, height: 1 });
  });
});

describe('import GEDZIP', () => {
  it('restitue sans perte un export Genealogor : arbre, fichiers, repères, métadonnées', async () => {
    const { bytes } = await buildGedzip({ data, archives, measure });
    const { data: back, archives: docs, report } = await readGedzip(bytes, measure);

    expect(Object.keys(back.individuals).sort()).toEqual(['@I1@', '@I2@', '@I3@']);
    expect(back.individuals['@I2@'].media ?? []).toEqual([]); // pas de faux média « @O1@ »
    expect(report).toMatchObject({ documents: 2, mediaFiles: 2, photoTags: 3, missingFiles: [] });

    const mariage = docs.find(d => d.id === 'doc-mariage')!;
    expect(mariage.fileData).toBe(PHOTO);
    expect(mariage).toMatchObject({
      title: 'Mariage Coste – Palem', type: 'photo', date: '1935', place: 'Tulle', mimeType: 'image/jpeg',
      notes: 'Remarque\nsur deux lignes', transcription: 'Au dos : « 12 juin 1935 »',
      linkedPersonIds: ['@I2@'], linkedFamilyIds: ['@F1@'],
    });
    // Repères identiques, dans le même ordre (numérotation conservée), avec leurs identifiants
    expect(mariage.photoTags).toEqual(archives[0].photoTags);

    const acte = docs.find(d => d.id === 'doc-acte')!;
    expect(acte).toMatchObject({ type: 'birth', callNumber: '3 E 142/12', archiveLocation: 'AD Corrèze', fileData: SCAN });
  });

  it('lit un GEDZIP d\'un autre logiciel : zone CROP convertie en repère', async () => {
    const ged = [
      '0 HEAD', '1 GEDC', '2 VERS 7.0',
      '0 @P1@ INDI', '1 NAME Louis /Lamy/', '1 OBJE @M1@', '2 CROP', '3 TOP 100', '3 LEFT 200', '3 HEIGHT 300', '3 WIDTH 400', '2 TITL Louis jeune',
      '0 @P2@ INDI', '1 NAME Anne /Lamy/', '1 OBJE @M1@',
      '0 @M1@ OBJE', '1 FILE photos/famille%20Lamy.png', '2 FORM image/png', '3 MEDI PHOTO', '2 TITL Famille Lamy',
      '0 @M2@ OBJE', '1 FILE https://exemple.org/registre.jpg', '2 FORM image/jpeg',
      '0 TRLR',
    ].join('\n');
    const png = bytesToDataUrl(bytesOf(100, 3), 'image/png');
    const zip = createZip([
      { name: 'gedcom.ged', data: new TextEncoder().encode(ged) },
      { name: 'photos/famille Lamy.png', data: dataUrlToBytes(png).bytes },
    ]);
    const { archives: docs, report } = await readGedzip(zip, measure);
    const famille = docs.find(d => d.title === 'Famille Lamy')!;
    expect(famille).toMatchObject({ type: 'photo', fileData: png, linkedPersonIds: ['@P2@'] });
    // Centre (400, 250) sur 2000×1000 ; taille 20 % × 30 %
    expect(famille.photoTags).toEqual([
      { id: expect.any(String), personId: '@P1@', x: 20, y: 25, width: 20, height: 30, label: 'Louis jeune' },
    ]);
    expect(report.missingFiles).toEqual(['https://exemple.org/registre.jpg']);
  });

  it('refuse une archive sans gedcom.ged ou un fichier qui n\'est pas un ZIP', async () => {
    const zip = createZip([{ name: 'autre.ged', data: new Uint8Array([48]) }]);
    await expect(readGedzip(zip, measure)).rejects.toThrow('gedcom.ged');
    await expect(readGedzip(new TextEncoder().encode('0 HEAD\n0 TRLR'), measure)).rejects.toThrow('ZIP');
  });

  it('détecte une archive altérée', async () => {
    const { bytes } = await buildGedzip({ data, archives, measure });
    const damaged = bytes.slice();
    damaged[200] ^= 0xff;
    await expect(readZip(damaged)).rejects.toThrow(/intégrité|corromp/);
  });
});
