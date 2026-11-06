import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stockage d'images simulé (IndexedDB n'existe pas sous Node)
const imageDb = new Map<string, string>();
const putSpy = vi.fn(async (entries: Array<{ id: string; data: string }>) => {
  if (failPuts) throw new Error('QuotaExceededError');
  entries.forEach(e => imageDb.set(e.id, e.data));
});
let failPuts = false;
vi.mock('../image-store', () => ({
  putImages: (entries: Array<{ id: string; data: string }>) => putSpy(entries),
  getImages: async (ids: string[]) => new Map(ids.filter(id => imageDb.has(id)).map(id => [id, imageDb.get(id)!])),
  deleteImages: async (ids: string[]) => { ids.forEach(id => imageDb.delete(id)); },
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

import {
  stripArchiveImages,
  persistArchives,
  loadMissingImages,
  attachImages,
  deleteArchiveImages,
  prepareArchiveForFirestore,
  mergeRemoteArchives,
  archivesStorageKey,
  getCloudArchiveIds,
  saveCloudArchiveIds,
  MAX_FIRESTORE_ARCHIVE_BYTES,
} from '../archive-persistence';
import { ArchiveDocument } from '../../types/genealogy';

const PHOTO = 'data:image/jpeg;base64,' + 'Q'.repeat(2_000);
const BIG_PHOTO = 'data:image/jpeg;base64,' + 'Z'.repeat(MAX_FIRESTORE_ARCHIVE_BYTES + 10);

const arc = (id: string, extra: Partial<ArchiveDocument> = {}): ArchiveDocument => ({
  id,
  title: `Archive ${id}`,
  type: 'photo',
  linkedPersonIds: [],
  linkedFamilyIds: [],
  photoTags: [{ id: 't', personId: 'p', x: 1, y: 2 }],
  createdAt: 0,
  updatedAt: 0,
  ...extra,
});

const readStored = (treeId: string): ArchiveDocument[] =>
  JSON.parse(localStorage.getItem(archivesStorageKey(treeId))!).data;

beforeEach(() => {
  store.clear();
  imageDb.clear();
  putSpy.mockClear();
  failPuts = false;
});

describe('persistArchives', () => {
  it('garde les métadonnées dans le localStorage et l\'image dans le stockage d\'images', async () => {
    await persistArchives('arbre', [arc('a', { fileData: PHOTO }), arc('b')]);
    const stored = readStored('arbre');
    expect(stored[0]).not.toHaveProperty('fileData');
    expect(stored[0]).toMatchObject({ id: 'a', imageStored: true, photoTags: [{ id: 't' }] });
    expect(stored[1]).not.toHaveProperty('imageStored');
    expect(imageDb.get('a')).toBe(PHOTO);
  });

  it('ne réécrit pas une image inchangée', async () => {
    await persistArchives('arbre', [arc('c', { fileData: PHOTO })]);
    await persistArchives('arbre', [arc('c', { fileData: PHOTO, title: 'Renommée' })]);
    expect(putSpy).toHaveBeenCalledTimes(2);
    expect(putSpy.mock.calls[1][0]).toEqual([]);
    expect(readStored('arbre')[0].title).toBe('Renommée');
  });

  it('retombe sur le localStorage complet si le stockage d\'images échoue', async () => {
    failPuts = true;
    await persistArchives('arbre', [arc('d', { fileData: PHOTO })]);
    expect(readStored('arbre')[0].fileData).toBe(PHOTO);
  });

  it('applique les sauvegardes dans l\'ordre (la plus récente gagne)', async () => {
    const first = persistArchives('arbre', [arc('e', { fileData: PHOTO, title: 'v1' })]);
    const second = persistArchives('arbre', [arc('e', { fileData: PHOTO, title: 'v2' })]);
    await Promise.all([first, second]);
    expect(readStored('arbre')[0].title).toBe('v2');
  });

  it('une archive non encore rechargée (sans image en mémoire) garde son marqueur', async () => {
    await persistArchives('arbre', [arc('f', { imageStored: true })]);
    expect(readStored('arbre')[0].imageStored).toBe(true);
  });
});

describe('rechargement des images', () => {
  it('survit à un « redémarrage » : métadonnées + images rechargées', async () => {
    await persistArchives('arbre', [arc('g', { fileData: PHOTO }), arc('h')]);
    const afterReload = readStored('arbre');
    const images = await loadMissingImages(afterReload, new Set());
    const restored = attachImages(afterReload, images);
    expect(restored[0].fileData).toBe(PHOTO);
    expect(restored[1].fileData).toBeUndefined();
  });

  it('ne redemande pas une image déjà cherchée', async () => {
    imageDb.set('i', PHOTO);
    const tried = new Set<string>();
    const list = [arc('i', { imageStored: true })];
    expect((await loadMissingImages(list, tried)).size).toBe(1);
    expect((await loadMissingImages(list, tried)).size).toBe(0);
  });

  it('supprime les images des archives supprimées', async () => {
    imageDb.set('j', PHOTO);
    await deleteArchiveImages(['j']);
    expect(imageDb.has('j')).toBe(false);
  });
});

describe('prepareArchiveForFirestore', () => {
  it('garde une petite image et retire le marqueur local', () => {
    const out = prepareArchiveForFirestore(arc('k', { fileData: PHOTO, imageStored: true }));
    expect(out.fileData).toBe(PHOTO);
    expect(out).not.toHaveProperty('imageStored');
  });

  it('retire une image trop lourde mais garde titre et étiquettes', () => {
    const out = prepareArchiveForFirestore(arc('l', { fileData: BIG_PHOTO }));
    expect(out).not.toHaveProperty('fileData');
    expect(out.title).toBe('Archive l');
    expect(out.photoTags).toHaveLength(1);
  });
});

describe('mergeRemoteArchives', () => {
  it('garde l\'image locale quand le cloud n\'en a pas', () => {
    const { merged } = mergeRemoteArchives(
      [arc('m', { title: 'Titre du cloud' })],
      [arc('m', { fileData: BIG_PHOTO })],
      new Set(['m'])
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ title: 'Titre du cloud', fileData: BIG_PHOTO });
  });

  it('garde le marqueur d\'une image locale pas encore rechargée', () => {
    const { merged } = mergeRemoteArchives([arc('n')], [arc('n', { imageStored: true })], new Set(['n']));
    expect(merged[0].imageStored).toBe(true);
  });

  it('conserve et fait téléverser une archive locale jamais arrivée dans le cloud', () => {
    const local = arc('o', { fileData: BIG_PHOTO });
    const { merged, toUpload } = mergeRemoteArchives([arc('p')], [local], new Set(['p']));
    expect(merged.map(a => a.id)).toEqual(['o', 'p']);
    expect(toUpload).toEqual([local]);
  });

  it('retire une archive déjà vue dans le cloud puis supprimée ailleurs', () => {
    const { merged, toUpload } = mergeRemoteArchives([], [arc('q')], new Set(['q']));
    expect(merged).toEqual([]);
    expect(toUpload).toEqual([]);
  });

  it('une liste du cloud vide n\'efface pas les archives locales', () => {
    const { merged, toUpload } = mergeRemoteArchives([], [arc('r'), arc('s')], new Set());
    expect(merged.map(a => a.id)).toEqual(['r', 's']);
    expect(toUpload).toHaveLength(2);
  });

  it('mémorise les archives vues dans le cloud par arbre', () => {
    saveCloudArchiveIds('arbre-1', new Set(['x', 'y']));
    expect([...getCloudArchiveIds('arbre-1')]).toEqual(['x', 'y']);
    expect(getCloudArchiveIds('arbre-2').size).toBe(0);
  });
});

describe('stripArchiveImages', () => {
  it('n\'altère pas les archives sans image', () => {
    const plain = arc('t');
    expect(stripArchiveImages([plain])[0]).toBe(plain);
  });
});
