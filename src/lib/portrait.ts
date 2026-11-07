/**
 * Portraits des personnes : visage cadré (repère avec largeur et hauteur) sur une photo d'archive.
 *
 * Le portrait est une référence (photo + cadre), jamais une copie : il suit les modifications du cadre et
 * ne pèse rien dans l'arbre. À l'affichage, la zone est découpée une fois en petite vignette carrée,
 * gardée en mémoire pendant la session.
 */

import { ArchiveDocument, Individual, PhotoTag, PortraitRef } from '../types/genealogy';

export interface FaceBox {
  /** Centre et taille en % de l'image */
  x: number;
  y: number;
  width: number;
  height: number;
}

export const hasFrame = (tag: PhotoTag): boolean => Boolean(tag.width && tag.height);

/** Image et cadre du portrait d'une personne ; null si la photo, le repère ou le cadre n'existent plus */
export function resolvePortrait(
  person: Pick<Individual, 'portrait'> | undefined,
  archivesById: Map<string, ArchiveDocument>
): { src: string; box: FaceBox; ref: PortraitRef } | null {
  const ref = person?.portrait;
  if (!ref) return null;
  const archive = archivesById.get(ref.archiveId);
  const tag = archive?.photoTags?.find(t => t.id === ref.tagId);
  if (!archive?.fileData || !tag || !hasFrame(tag)) return null;
  return { src: archive.fileData, box: { x: tag.x, y: tag.y, width: tag.width!, height: tag.height! }, ref };
}

/** Premier visage cadré d'une personne (portrait proposé par défaut) */
export function firstFramedFace(personId: string, archives: ArchiveDocument[]): PortraitRef | null {
  for (const archive of archives) {
    const tag = archive.photoTags?.find(t => t.personId === personId && hasFrame(t));
    if (tag) return { archiveId: archive.id, tagId: tag.id };
  }
  return null;
}

/**
 * Zone carrée (en pixels) à découper autour d'un cadre : côté = plus grand côté du cadre, centrée, ramenée
 * dans l'image. Un visage cadré en rectangle donne ainsi une vignette ronde ou carrée sans déformation.
 */
export function squareCrop(box: FaceBox, imgW: number, imgH: number): { sx: number; sy: number; side: number } {
  const w = (box.width / 100) * imgW;
  const h = (box.height / 100) * imgH;
  const side = Math.max(1, Math.min(Math.max(w, h), imgW, imgH));
  const cx = (box.x / 100) * imgW;
  const cy = (box.y / 100) * imgH;
  const sx = Math.min(Math.max(0, cx - side / 2), imgW - side);
  const sy = Math.min(Math.max(0, cy - side / 2), imgH - side);
  return { sx, sy, side };
}

/** Cadre normalisé à partir de deux coins (en %), borné à l'image */
export function boxFromCorners(x1: number, y1: number, x2: number, y2: number): FaceBox {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const left = clamp(Math.min(x1, x2)), right = clamp(Math.max(x1, x2));
  const top = clamp(Math.min(y1, y2)), bottom = clamp(Math.max(y1, y2));
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { x: r1((left + right) / 2), y: r1((top + bottom) / 2), width: r1(right - left), height: r1(bottom - top) };
}

// --- Vignettes (navigateur) ---

const thumbCache = new Map<string, Promise<string>>();
const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  // La clé tient compte de la longueur et des extrémités : les data URL peuvent faire plusieurs Mo
  const key = `${src.length}:${src.slice(0, 48)}:${src.slice(-48)}`;
  let p = imageCache.get(key);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = src;
    });
    imageCache.set(key, p);
    p.catch(() => imageCache.delete(key));
  }
  return p;
}

/** Vignette carrée (JPEG en data URL) du visage, mise en cache pour la session */
export function portraitThumbnail(src: string, box: FaceBox, size = 160): Promise<string> {
  const key = `${src.length}:${src.slice(-48)}|${box.x},${box.y},${box.width},${box.height}|${size}`;
  let p = thumbCache.get(key);
  if (!p) {
    p = loadImage(src).then(img => {
      const { sx, sy, side } = squareCrop(box, img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponible');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      return canvas.toDataURL('image/jpeg', 0.85);
    });
    thumbCache.set(key, p);
    p.catch(() => thumbCache.delete(key));
  }
  return p;
}
