/**
 * Persistance des archives sans perte d'images.
 *
 * - Les métadonnées (titre, étiquettes…) restent dans le localStorage ; les images vont dans IndexedDB.
 * - Firestore ne reçoit pas une image qui ferait dépasser la limite de 1 Mio d'un document
 *   (sinon tout le document était refusé et l'archive disparaissait au chargement suivant).
 * - La fusion avec la liste du cloud ne supprime plus une archive locale qui n'y est jamais arrivée.
 */

import { ArchiveDocument } from '../types/genealogy';
import { STORAGE_KEYS, setVersionedItem } from './storage-manager';
import { deleteImages, getImages, putImages } from './image-store';

/** Marge sous la limite de 1 048 576 octets d'un document Firestore */
export const MAX_FIRESTORE_ARCHIVE_BYTES = 900_000;

export const archivesStorageKey = (treeId: string) => `${STORAGE_KEYS.ARCHIVES}_${treeId}`;
const cloudIdsKey = (treeId: string) => `genealogor_cloud_archive_ids_${treeId}`;

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Version destinée au localStorage : sans image, avec un marqueur indiquant qu'elle est dans IndexedDB */
export function stripArchiveImages(archives: ArchiveDocument[]): ArchiveDocument[] {
  return archives.map(a => {
    if (!a.fileData) return a;
    const { fileData, ...rest } = a;
    return { ...rest, imageStored: true };
  });
}

/** Signature légère pour ne pas réécrire une image inchangée à chaque sauvegarde */
function signature(data: string): string {
  return `${data.length}:${data.slice(0, 64)}:${data.slice(-64)}`;
}
const storedSignatures = new Map<string, string>();

let queue: Promise<void> = Promise.resolve();

/**
 * Enregistre les archives d'un arbre. Les appels sont sérialisés : une sauvegarde plus ancienne ne peut
 * pas écraser une plus récente. Si IndexedDB est indisponible, retombe sur l'ancien comportement
 * (tout dans le localStorage).
 */
export function persistArchives(treeId: string, archives: ArchiveDocument[]): Promise<void> {
  const task = async () => {
    const key = archivesStorageKey(treeId);
    const changed = archives.filter(a => a.fileData && storedSignatures.get(a.id) !== signature(a.fileData));
    try {
      await putImages(changed.map(a => ({ id: a.id, data: a.fileData! })));
      for (const a of changed) storedSignatures.set(a.id, signature(a.fileData!));
      setVersionedItem(key, stripArchiveImages(archives));
    } catch (e) {
      console.warn('Stockage des images indisponible, repli sur le localStorage :', e);
      setVersionedItem(key, archives);
    }
  };
  queue = queue.then(task, task);
  return queue;
}

/** Récupère dans IndexedDB les images manquantes des archives marquées `imageStored` */
export async function loadMissingImages(archives: ArchiveDocument[], alreadyTried: Set<string>): Promise<Map<string, string>> {
  const ids = archives.filter(a => !a.fileData && a.imageStored && !alreadyTried.has(a.id)).map(a => a.id);
  ids.forEach(id => alreadyTried.add(id));
  if (ids.length === 0) return new Map();
  const images = await getImages(ids);
  images.forEach((data, id) => storedSignatures.set(id, signature(data)));
  return images;
}

export function attachImages(archives: ArchiveDocument[], images: Map<string, string>): ArchiveDocument[] {
  if (images.size === 0) return archives;
  return archives.map(a => (!a.fileData && images.has(a.id) ? { ...a, fileData: images.get(a.id) } : a));
}

export async function deleteArchiveImages(ids: string[]): Promise<void> {
  ids.forEach(id => storedSignatures.delete(id));
  try {
    await deleteImages(ids);
  } catch (e) {
    console.warn('Suppression des images impossible :', e);
  }
}

/** Version envoyée à Firestore : sans marqueur local, et sans l'image si elle est trop lourde */
export function prepareArchiveForFirestore(archive: ArchiveDocument): ArchiveDocument {
  const { imageStored, ...rest } = archive;
  if (rest.fileData && byteSize(rest) > MAX_FIRESTORE_ARCHIVE_BYTES) {
    const { fileData, ...withoutImage } = rest;
    return withoutImage;
  }
  return rest;
}

// --- Fusion avec la liste du cloud ---

export function getCloudArchiveIds(treeId: string): Set<string> {
  try {
    const raw = localStorage.getItem(cloudIdsKey(treeId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveCloudArchiveIds(treeId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(cloudIdsKey(treeId), JSON.stringify([...ids]));
  } catch {}
}

/**
 * Fusionne la liste reçue du cloud avec la liste locale :
 * - une archive du cloud sans image garde l'image locale ;
 * - une archive locale absente du cloud est conservée (et à téléverser) si elle n'y a jamais été vue ;
 *   si elle y a déjà été vue, c'est qu'elle a été supprimée ailleurs : elle est retirée.
 */
export function mergeRemoteArchives(
  remote: ArchiveDocument[],
  local: ArchiveDocument[],
  knownCloudIds: Set<string>
): { merged: ArchiveDocument[]; toUpload: ArchiveDocument[] } {
  const localById = new Map(local.map(a => [a.id, a]));
  const remoteIds = new Set(remote.map(a => a.id));

  const fromRemote = remote.map(r => {
    if (r.fileData) return r;
    const l = localById.get(r.id);
    if (l?.fileData) return { ...r, fileData: l.fileData };
    if (l?.imageStored) return { ...r, imageStored: true };
    return r;
  });
  const toUpload = local.filter(l => !remoteIds.has(l.id) && !knownCloudIds.has(l.id));
  return { merged: [...toUpload, ...fromRemote], toUpload };
}
