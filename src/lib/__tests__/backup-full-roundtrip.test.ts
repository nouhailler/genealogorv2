import { describe, it, expect, vi, beforeEach } from 'vitest';

// Images stockées dans IndexedDB, simulées (absentes sous Node)
const imageDb = new Map<string, string>();
vi.mock('../image-store', () => ({
  putImages: async (entries: Array<{ id: string; data: string }>) => { entries.forEach(e => imageDb.set(e.id, e.data)); },
  getImages: async (ids: string[]) => new Map(ids.filter(id => imageDb.has(id)).map(id => [id, imageDb.get(id)!])),
  deleteImages: async () => {},
}));

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

import { createFullBackup, previewBackup, restoreBackup, restorePreBackupSafety } from '../backup-restore';
import { withStoredImages } from '../archive-persistence';
import { getSampleGenealogy } from '../sample-data';
import { ArchiveDocument, BranchAccess } from '../../types/genealogy';
import { PhotoShareRecord } from '../photo-share';

const tree = getSampleGenealogy();
const [p1, p2, p3] = Object.keys(tree.individuals);

/** Base64 pseudo-aléatoire de la taille voulue (incompressible, comme une vraie photo) */
function fakeImage(chars: number, mime = 'image/jpeg'): string {
  const bytes = new Uint8Array(Math.ceil(chars * 0.75));
  for (let i = 0; i < bytes.length; i += 65_536) crypto.getRandomValues(bytes.subarray(i, i + 65_536));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${mime};base64,` + btoa(bin);
}

const PHOTO = fakeImage(300_000);
const SCAN = fakeImage(200_000, 'application/pdf');
const STORED_PHOTO = fakeImage(250_000);

const archives: ArchiveDocument[] = [
  {
    id: 'doc-photo', title: 'Mariage 1950', type: 'photo', date: '1950', place: 'Tulle',
    fileData: PHOTO, fileName: 'mariage.jpg', mimeType: 'image/jpeg',
    linkedPersonIds: [p1, p2], linkedFamilyIds: [],
    photoTags: [
      { id: 't1', personId: p1, x: 41.5, y: 55.25, label: 'Le marié', confidence: 'certain' },
      { id: 't2', personId: p2, x: 58, y: 54, label: 'La mariée' },
    ],
    createdAt: 1, updatedAt: 2,
  },
  {
    id: 'doc-acte', title: 'Acte de naissance', type: 'birth', transcription: 'L\'an mil…', callNumber: '3 E 142/12',
    fileData: SCAN, fileName: 'acte.pdf', mimeType: 'application/pdf',
    linkedPersonIds: [p3], linkedFamilyIds: [], createdAt: 3, updatedAt: 4,
  },
  // Image pas encore rechargée à l'écran : seulement dans IndexedDB
  {
    id: 'doc-stocke', title: 'Portrait', type: 'photo', imageStored: true, mimeType: 'image/jpeg',
    linkedPersonIds: [], linkedFamilyIds: [], photoTags: [{ id: 't3', personId: p3, x: 10, y: 20 }],
    createdAt: 5, updatedAt: 6,
  },
];

const access: BranchAccess[] = [];
const photoShares: PhotoShareRecord[] = [{
  token: 'shr-abcdefghijklmnopqrstuv', key: 'cle-secrete', archiveId: 'doc-photo',
  archiveTitle: 'Mariage 1950', hideLiving: true, createdAt: '2026-11-01', updatedAt: '2026-11-02',
}];
const changeLog = [{ id: 'c1', kind: 'archive:add', at: 1, summary: 'Ajout' }] as any[];

beforeEach(() => {
  imageDb.clear();
  imageDb.set('doc-stocke', STORED_PHOTO);
  store.clear();
});

async function roundTrip(passphrase?: string) {
  const { archives: complete, missing } = await withStoredImages(archives);
  const json = await createFullBackup(tree, complete, access, passphrase, { photoShares, changeLog });
  const res = await restoreBackup(json, tree, [], [], passphrase);
  return { json, res, missing };
}

describe('Sauvegarde complète : tout est sauvé, tout est restauré', () => {
  for (const passphrase of [undefined, 'phrase secrète très longue 2026']) {
    const label = passphrase ? 'chiffrée' : 'standard';

    it(`restaure à l'identique photos, actes, étiquettes et compléments (${label})`, async () => {
      const { res, missing } = await roundTrip(passphrase);
      expect(missing).toEqual([]);
      expect(res.success).toBe(true);
      const restored = res.data!;

      const byId = new Map(restored.archives.map(a => [a.id, a]));
      expect(byId.get('doc-photo')!.fileData).toBe(PHOTO);
      expect(byId.get('doc-acte')!.fileData).toBe(SCAN);
      // L'image qui n'était que dans IndexedDB est bien dans le fichier
      expect(byId.get('doc-stocke')!.fileData).toBe(STORED_PHOTO);
      expect(byId.get('doc-stocke')).not.toHaveProperty('imageStored');

      expect(byId.get('doc-photo')!.photoTags).toEqual(archives[0].photoTags);
      expect(byId.get('doc-stocke')!.photoTags).toEqual(archives[2].photoTags);
      expect(byId.get('doc-acte')).toMatchObject({ transcription: 'L\'an mil…', callNumber: '3 E 142/12', fileName: 'acte.pdf' });
      expect(byId.get('doc-photo')).toMatchObject({ date: '1950', place: 'Tulle', linkedPersonIds: [p1, p2] });

      expect(Object.keys(restored.genealogy.individuals)).toEqual(Object.keys(tree.individuals));
      expect(restored.extras?.photoShares).toEqual(photoShares);
      expect(restored.extras?.changeLog).toEqual(changeLog);
    });
  }

  it('le manifeste annonce le nombre de fichiers et de personnes identifiées', async () => {
    const { json } = await roundTrip();
    const preview = await previewBackup(json);
    expect(preview.manifest?.stats).toMatchObject({ archivesCount: 3, filesCount: 3, photoTagsCount: 3 });
  });

  it('accepte une sauvegarde de plusieurs dizaines de Mo et un fichier de plus de 15 Mo', async () => {
    const big = fakeImage(20 * 1024 * 1024);
    const many = Array.from({ length: 3 }, (_, i) => ({ ...archives[0], id: `big-${i}`, fileData: big }));
    const json = await createFullBackup(tree, many, access);
    expect(json.length).toBeGreaterThan(50 * 1024 * 1024);
    const res = await restoreBackup(json, tree, [], []);
    expect(res.success).toBe(true);
    expect(res.data!.archives.every(a => a.fileData === big)).toBe(true);
  }, 60_000);

  it('signale les fichiers introuvables sur cet appareil', async () => {
    imageDb.clear();
    const fromOtherDevice: ArchiveDocument = {
      id: 'doc-ailleurs', title: 'Ajouté ailleurs', type: 'photo', mimeType: 'image/jpeg',
      linkedPersonIds: [], linkedFamilyIds: [], createdAt: 0, updatedAt: 0,
    };
    const { missing } = await withStoredImages([...archives, fromOtherDevice]);
    expect(missing.map(a => a.id).sort()).toEqual(['doc-ailleurs', 'doc-stocke']);
  });

  it('une sauvegarde ancienne (sans compléments) reste restaurable', async () => {
    const json = await createFullBackup(tree, archives.slice(0, 1), access);
    const res = await restoreBackup(json, tree, [], []);
    expect(res.success).toBe(true);
    expect(res.data!.extras).toBeUndefined();
  });

  it('la copie de secours avant restauration garde les étiquettes sans alourdir le localStorage', async () => {
    const json = await createFullBackup(tree, archives.slice(0, 1), access);
    await restoreBackup(json, tree, archives, access);
    const safety = restorePreBackupSafety()!;
    expect(safety.archives[0]).toMatchObject({ id: 'doc-photo', imageStored: true, photoTags: archives[0].photoTags });
    expect(safety.archives[0]).not.toHaveProperty('fileData');
  });
});
