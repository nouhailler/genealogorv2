import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../gedcom-parser';
import { openSnapshot, generateShareKey, MAX_SHARE_PAYLOAD_CHARS, readShareParams } from '../share-snapshot';
import {
  buildPhotoShareTags,
  sealPhotoSnapshot,
  isPhotoSnapshot,
  isShareableImage,
  buildPhotoShareUrl,
  newPhotoShareCredentials,
  upsertPhotoShareRecord,
  IMAGE_ATTEMPTS,
  LIVING_PLACEHOLDER,
  PhotoShareRecord,
} from '../photo-share';
import { ArchiveDocument } from '../../types/genealogy';

// @I1@ née en 1995 (vivante) ; @I2@ 1905–1982 ; @I3@ 1910–1990
const GED = `0 HEAD
0 @I1@ INDI
1 NAME Gabrielle /Coste/
1 SEX F
1 BIRT
2 DATE 1995
0 @I2@ INDI
1 NAME Henri /Coste/
1 SEX M
1 BIRT
2 DATE 12 MAR 1905
1 DEAT
2 DATE 1982
0 @I3@ INDI
1 NAME Marie /Palem/
1 SEX F
1 BIRT
2 DATE 1910
1 DEAT
2 DATE ABT 1990
0 TRLR`;

const data = parseGedcom(GED);
const id = (name: string) => Object.values(data.individuals).find(p => p.name.includes(name))!.id;

const IMAGE = 'data:image/jpeg;base64,' + 'A'.repeat(200);

const archive: ArchiveDocument = {
  id: 'arc-1',
  title: 'Mariage Coste – Palem',
  type: 'photo',
  date: '1935',
  place: 'Tulle',
  fileData: IMAGE,
  mimeType: 'image/jpeg',
  linkedPersonIds: [],
  linkedFamilyIds: [],
  photoTags: [
    { id: 't1', personId: id('Henri'), x: 40, y: 50, label: 'Le marié' },
    { id: 't2', personId: 'personne-supprimee', x: 10, y: 10 },
    { id: 't3', personId: id('Marie'), x: 55, y: 52 },
    { id: 't4', personId: id('Gabrielle'), x: 80, y: 70, label: 'Au premier rang' },
  ],
  createdAt: 0,
  updatedAt: 0,
};

const identityResize = async (dataUrl: string) => dataUrl;

describe('buildPhotoShareTags', () => {
  it('garde la numérotation de l\'application et ignore les personnes supprimées', () => {
    const tags = buildPhotoShareTags(archive, data, false);
    expect(tags.map(t => t.n)).toEqual([1, 3, 4]);
    expect(tags[0]).toMatchObject({ name: 'Henri Coste', years: '1905 – 1982', label: 'Le marié', x: 40, y: 50 });
    expect(tags[1].years).toBe('1910 – 1990');
  });

  it('remplace nom, dates et précision des personnes vivantes quand demandé', () => {
    const tags = buildPhotoShareTags(archive, data, true);
    const living = tags.find(t => t.n === 4)!;
    expect(living).toEqual({ n: 4, x: 80, y: 70, name: LIVING_PLACEHOLDER });
    expect(JSON.stringify(tags)).not.toContain('Gabrielle');
    expect(JSON.stringify(tags)).not.toContain('premier rang');
    expect(tags.find(t => t.n === 1)!.name).toBe('Henri Coste');
  });
});

describe('sealPhotoSnapshot', () => {
  it('produit un instantané photo déchiffrable avec la clé, sans données de l\'arbre', async () => {
    const key = generateShareKey();
    const payload = await sealPhotoSnapshot(archive, data, true, key, identityResize);
    const snapshot = await openSnapshot(payload, key);
    expect(isPhotoSnapshot(snapshot)).toBe(true);
    if (!isPhotoSnapshot(snapshot)) return;
    expect(snapshot).toMatchObject({ title: archive.title, date: '1935', place: 'Tulle', image: IMAGE });
    expect(snapshot.tags).toHaveLength(3);
    expect(snapshot).not.toHaveProperty('tree');
    expect(JSON.stringify(snapshot)).not.toContain('Gabrielle');
  });

  it('refuse une mauvaise clé', async () => {
    const payload = await sealPhotoSnapshot(archive, data, false, generateShareKey(), identityResize);
    await expect(openSnapshot(payload, generateShareKey())).rejects.toThrow();
  });

  it('réduit l\'image jusqu\'à tenir dans la limite Firestore', async () => {
    const calls: number[] = [];
    // Bruit aléatoire : incompressible, comme un vrai JPEG
    const noise = (chars: number) => {
      const bytes = new Uint8Array(Math.ceil(chars * 0.75));
      for (let i = 0; i < bytes.length; i += 65_536) crypto.getRandomValues(bytes.subarray(i, i + 65_536));
      let bin = '';
      for (const b of bytes) bin += String.fromCharCode(b);
      return 'data:image/jpeg;base64,' + btoa(bin);
    };
    const resize = async (_: string, maxSide: number) => {
      calls.push(maxSide);
      return noise(maxSide >= 1400 ? 800_000 : 300_000);
    };
    const payload = await sealPhotoSnapshot(archive, data, false, generateShareKey(), resize);
    expect(payload.length).toBeLessThanOrEqual(MAX_SHARE_PAYLOAD_CHARS);
    expect(calls).toEqual([1600, 1400, 1200]);
  });

  it('échoue clairement si même la plus petite version est trop lourde', async () => {
    const huge = 'data:image/jpeg;base64,' + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(60_000)))).repeat(20);
    await expect(
      sealPhotoSnapshot(archive, data, false, generateShareKey(), async () => huge)
    ).rejects.toThrow('Image trop volumineuse');
  }, 20_000);

  it('refuse un document sans image', async () => {
    const pdf = { ...archive, fileData: 'data:application/pdf;base64,AAAA', mimeType: 'application/pdf' };
    await expect(sealPhotoSnapshot(pdf, data, false, generateShareKey(), identityResize)).rejects.toThrow('pas d\'image');
  });
});

describe('utilitaires', () => {
  it('reconnaît une image partageable', () => {
    expect(isShareableImage(archive)).toBe(true);
    expect(isShareableImage({ ...archive, mimeType: undefined })).toBe(true);
    expect(isShareableImage({ ...archive, fileData: undefined })).toBe(false);
    expect(isShareableImage({ ...archive, mimeType: 'application/pdf' })).toBe(false);
  });

  it('construit une URL que l\'application sait relire', () => {
    const creds = newPhotoShareCredentials();
    const url = new URL(buildPhotoShareUrl('https://genealogor.example/', creds));
    expect(readShareParams(url.search, url.hash)).toEqual(creds);
  });

  it('remplace un lien existant au lieu de le dupliquer', () => {
    const rec = (token: string, updatedAt: string): PhotoShareRecord => ({
      token, key: 'k', archiveId: 'arc-1', archiveTitle: 't', hideLiving: true, createdAt: 'c', updatedAt,
    });
    const list = upsertPhotoShareRecord([rec('a', '1'), rec('b', '1')], rec('a', '2'));
    expect(list.map(r => [r.token, r.updatedAt])).toEqual([['a', '2'], ['b', '1']]);
  });

  it('propose des essais de plus en plus légers', () => {
    for (let i = 1; i < IMAGE_ATTEMPTS.length; i++) {
      expect(IMAGE_ATTEMPTS[i].maxSide).toBeLessThan(IMAGE_ATTEMPTS[i - 1].maxSide);
    }
  });
});
