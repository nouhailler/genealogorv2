/**
 * Partage d'une photo étiquetée par lien secret (`?share=<jeton>#k=<clé>`).
 *
 * Réutilise le mécanisme des liens d'arbre (`share-snapshot.ts`) : document Firestore `/shares/{jeton}`,
 * contenu compressé puis chiffré (AES-GCM), clé dans le fragment d'URL jamais transmis aux serveurs.
 * Différence : l'instantané contient une version allégée de l'image (JPEG redimensionné) et seulement
 * les personnes étiquetées sur la photo, pas l'arbre.
 */

import { ArchiveDocument, GenealogyData } from '../types/genealogy';
import { getProtectedPersonIds } from './privacy';
import {
  MAX_SHARE_PAYLOAD_CHARS,
  SHARE_FORMAT_VERSION,
  ShareDocument,
  generateSecureShareToken,
  generateShareKey,
  sealSnapshot,
} from './share-snapshot';

export const LIVING_PLACEHOLDER = 'Personne vivante';

export interface PhotoShareTag {
  /** Numéro affiché sur le repère (identique à celui de l'application) */
  n: number;
  x: number;
  y: number;
  name: string;
  /** Ex. « 1921 – 1998 » */
  years?: string;
  label?: string;
}

export interface PhotoShareSnapshot {
  version: number;
  kind: 'photo';
  title: string;
  date?: string;
  place?: string;
  generatedAt: string;
  /** Image allégée en data URL JPEG */
  image: string;
  tags: PhotoShareTag[];
}

/** Lien photo mémorisé sur l'appareil du créateur (la clé n'est jamais publiée) */
export interface PhotoShareRecord {
  token: string;
  key: string;
  archiveId: string;
  archiveTitle: string;
  hideLiving: boolean;
  createdAt: string;
  updatedAt: string;
}

export function isPhotoSnapshot(value: unknown): value is PhotoShareSnapshot {
  return Boolean(value) && (value as PhotoShareSnapshot).kind === 'photo';
}

export function isShareableImage(archive: ArchiveDocument): boolean {
  if (!archive.fileData) return false;
  if (archive.mimeType) return archive.mimeType.startsWith('image/');
  return archive.fileData.startsWith('data:image/');
}

function yearOf(date?: string): string | undefined {
  const matches = date?.match(/\d{4}/g);
  return matches ? matches[matches.length - 1] : undefined;
}

function lifeYears(birth?: string, death?: string): string | undefined {
  const b = yearOf(birth);
  const d = yearOf(death);
  if (!b && !d) return undefined;
  return `${b || '?'} – ${d || ''}`.trim();
}

/**
 * Étiquettes visibles par le destinataire. Une personne protégée (vivante selon la politique de
 * confidentialité) garde son repère mais perd son nom, ses dates et la précision saisie.
 */
export function buildPhotoShareTags(
  archive: ArchiveDocument,
  data: GenealogyData,
  hideLiving: boolean
): PhotoShareTag[] {
  const protectedIds = hideLiving ? getProtectedPersonIds(data) : new Set<string>();
  const result: PhotoShareTag[] = [];
  (archive.photoTags || []).forEach((tag, idx) => {
    const person = data.individuals[tag.personId];
    if (!person) return;
    const base = { n: idx + 1, x: tag.x, y: tag.y };
    if (protectedIds.has(person.id)) {
      result.push({ ...base, name: LIVING_PLACEHOLDER });
      return;
    }
    const years = lifeYears(person.birth?.date, person.death?.date);
    result.push({
      ...base,
      name: person.name,
      ...(years ? { years } : {}),
      ...(tag.label ? { label: tag.label } : {}),
    });
  });
  return result;
}

export function buildPhotoShareSnapshot(
  archive: ArchiveDocument,
  data: GenealogyData,
  image: string,
  hideLiving: boolean
): PhotoShareSnapshot {
  return {
    version: SHARE_FORMAT_VERSION,
    kind: 'photo',
    title: archive.title,
    ...(archive.date ? { date: archive.date } : {}),
    ...(archive.place ? { place: archive.place } : {}),
    generatedAt: new Date().toISOString(),
    image,
    tags: buildPhotoShareTags(archive, data, hideLiving),
  };
}

/** Redimensionne et recompresse une image en JPEG (navigateur uniquement) */
export async function downscaleImage(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  const img = new Image();
  img.decoding = 'async';
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Traitement d\'image indisponible dans ce navigateur.');
  ctx.fillStyle = '#ffffff'; // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Essais successifs, du plus fidèle au plus léger, jusqu'à tenir dans un document Firestore */
export const IMAGE_ATTEMPTS: ReadonlyArray<{ maxSide: number; quality: number }> = [
  { maxSide: 1600, quality: 0.82 },
  { maxSide: 1400, quality: 0.75 },
  { maxSide: 1200, quality: 0.7 },
  { maxSide: 1000, quality: 0.65 },
  { maxSide: 800, quality: 0.6 },
];

/**
 * Construit et chiffre l'instantané d'une photo, en réduisant l'image tant que le contenu chiffré
 * dépasse la limite d'un document Firestore.
 */
export async function sealPhotoSnapshot(
  archive: ArchiveDocument,
  data: GenealogyData,
  hideLiving: boolean,
  shareKey: string,
  resize: (dataUrl: string, maxSide: number, quality: number) => Promise<string> = downscaleImage
): Promise<string> {
  if (!isShareableImage(archive)) throw new Error('Ce document ne contient pas d\'image à partager.');
  for (const { maxSide, quality } of IMAGE_ATTEMPTS) {
    const image = await resize(archive.fileData!, maxSide, quality);
    const snapshot = buildPhotoShareSnapshot(archive, data, image, hideLiving);
    try {
      // sealSnapshot est typé pour les arbres mais ne fait que sérialiser, compresser et chiffrer
      const payload = await sealSnapshot(snapshot as never, shareKey);
      if (payload.length <= MAX_SHARE_PAYLOAD_CHARS) return payload;
    } catch (e) {
      if (!(e instanceof Error) || !e.message.includes('trop volumineux')) throw e;
    }
  }
  throw new Error('Image trop volumineuse pour un lien de partage, même réduite.');
}

export function newPhotoShareCredentials(): { token: string; key: string } {
  return { token: generateSecureShareToken(), key: generateShareKey() };
}

export function buildPhotoShareDocument(treeId: string, ownerId: string, payload: string): ShareDocument {
  return {
    version: SHARE_FORMAT_VERSION,
    treeId,
    ownerId,
    hasPassword: false,
    payload,
    updatedAt: new Date().toISOString(),
  };
}

export function buildPhotoShareUrl(baseUrl: string, record: Pick<PhotoShareRecord, 'token' | 'key'>): string {
  return `${baseUrl}?share=${encodeURIComponent(record.token)}#k=${record.key}`;
}

// --- Mémorisation locale des liens photo (par arbre) ---

const recordsKey = (treeId: string) => `genealogor_photo_shares_${treeId}`;

export function getPhotoShareRecords(treeId: string): PhotoShareRecord[] {
  try {
    const raw = localStorage.getItem(recordsKey(treeId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePhotoShareRecords(treeId: string, records: PhotoShareRecord[]): void {
  try {
    localStorage.setItem(recordsKey(treeId), JSON.stringify(records));
  } catch {
    // stockage indisponible : le lien reste valide, seule sa gestion locale est perdue
  }
}

export function upsertPhotoShareRecord(records: PhotoShareRecord[], record: PhotoShareRecord): PhotoShareRecord[] {
  return [record, ...records.filter(r => r.token !== record.token)];
}
