/**
 * Export et import GEDCOM 7 « GEDZIP » (.gdz) : un ZIP contenant `gedcom.ged` et les fichiers des archives.
 *
 * - Chaque archive avec fichier devient un enregistrement `0 @On@ OBJE` (FILE, FORM, MEDI, TITL).
 * - Chaque personne identifiée sur une photo devient un lien `1 OBJE @On@` dans sa fiche, avec la zone
 *   `CROP` (TOP/LEFT/HEIGHT/WIDTH, en pixels comme l'exige la norme) et le libellé en `TITL`.
 * - Les données propres à Genealogor (type d'acte, cote, position exacte en %…) sont dans des balises
 *   d'extension `_GN_*` déclarées dans `HEAD.SCHMA` : les autres logiciels peuvent les ignorer,
 *   Genealogor les relit sans perte. Voir docs/gedzip.md.
 */

import { ArchiveDocument, ArchiveDocumentType, GenealogyData, PhotoTag } from '../types/genealogy';
import { serializeGedcomWithReport, textLines } from './gedcom-serializer';
import { parseGedcom } from './gedcom-parser';
import { getProtectedPersonIds, sanitizeArchivesForPrivacy } from './privacy';
import { createZip, readZip } from './zip';

export const GEDZIP_DATASET = 'gedcom.ged';
const DOC_URI = 'https://github.com/nouhailler/genealogorv2/blob/main/docs/gedzip.md';

export const GEDZIP_SCHEMA_TAGS: Array<{ tag: string; uri: string }> = [
  '_GN_ID', '_GN_TYPE', '_GN_DATE', '_GN_PLAC', '_GN_REPO', '_GN_CALN', '_GN_REPU', '_GN_NOTE',
  '_GN_POS', '_GN_CONF', '_GN_ROLE', '_GN_ORDER',
].map(tag => ({ tag, uri: `${DOC_URI}#${tag.toLowerCase()}` }));

export type Dimensions = { width: number; height: number };
export type MeasureImage = (dataUrl: string) => Promise<Dimensions | null>;

/** Dimensions en pixels d'une image (navigateur) ; null si ce n'est pas une image lisible */
export const measureImageInBrowser: MeasureImage = async dataUrl => {
  if (!dataUrl.startsWith('data:image/')) return null;
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    return img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null;
  } catch {
    return null;
  }
};

// --- Fichiers ---

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/tiff': 'tif',
  'image/bmp': 'bmp', 'image/svg+xml': 'svg', 'image/heic': 'heic', 'application/pdf': 'pdf',
};
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime])
);
MIME_BY_EXT.jpeg = 'image/jpeg';
MIME_BY_EXT.tiff = 'image/tiff';

export function dataUrlToBytes(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Fichier joint illisible.');
  const mime = match[1] || 'application/octet-stream';
  if (!match[2]) return { mime, bytes: new TextEncoder().encode(decodeURIComponent(match[3])) };
  const binary = atob(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { mime, bytes };
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function slug(text: string): string {
  const s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s || 'document';
}

function extensionFor(archive: ArchiveDocument, mime: string): string {
  if (EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  const fromName = archive.fileName?.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase();
  return fromName || 'bin';
}

const MEDI_BY_TYPE: Record<ArchiveDocumentType, string> = {
  photo: 'PHOTO', birth: 'MANUSCRIPT', baptism: 'MANUSCRIPT', marriage: 'MANUSCRIPT', death: 'MANUSCRIPT',
  burial: 'MANUSCRIPT', census: 'MANUSCRIPT', notarial: 'MANUSCRIPT', military: 'MANUSCRIPT',
  livret: 'BOOK', other: 'OTHER',
};

const ARCHIVE_TYPES = new Set<ArchiveDocumentType>(Object.keys(MEDI_BY_TYPE) as ArchiveDocumentType[]);

// --- Zones CROP ---

/**
 * Zone CROP (pixels) centrée sur le repère. Sans taille de repère, carré de 10 % du petit côté, réduit si
 * besoin pour rester dans l'image sans décaler le centre (la norme interdit de dépasser l'image).
 */
export function tagToCrop(tag: PhotoTag, dims: Dimensions): { top: number; left: number; width: number; height: number } {
  const { width: W, height: H } = dims;
  const cx = (tag.x / 100) * W;
  const cy = (tag.y / 100) * H;
  const defaultSide = 0.1 * Math.min(W, H);
  const halfW = Math.min((tag.width ? (tag.width / 100) * W : defaultSide) / 2, cx, W - cx);
  const halfH = Math.min((tag.height ? (tag.height / 100) * H : defaultSide) / 2, cy, H - cy);
  const width = Math.max(1, Math.round(2 * halfW));
  const height = Math.max(1, Math.round(2 * halfH));
  const left = Math.min(Math.max(0, Math.round(cx - halfW)), W - width);
  const top = Math.min(Math.max(0, Math.round(cy - halfH)), H - height);
  return { top, left, width, height };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- Export ---

export interface GedzipExportReport {
  individuals: number;
  families: number;
  mediaFiles: number;
  personLinks: number;
  photoTags: number;
  /** Archives sans fichier sur cet appareil : non incluses (GEDCOM 7 exige un FILE) */
  skipped: ArchiveDocument[];
  maskedLiving: number;
}

export async function buildGedzip(input: {
  data: GenealogyData;
  archives: ArchiveDocument[];
  hideLiving?: boolean;
  measure?: MeasureImage;
}): Promise<{ bytes: Uint8Array; gedcom: string; report: GedzipExportReport }> {
  const { data, hideLiving = false, measure = measureImageInBrowser } = input;
  const archives = hideLiving
    ? sanitizeArchivesForPrivacy(input.archives, getProtectedPersonIds(data))
    : input.archives;

  const withFile = archives.filter(a => a.fileData);
  const skipped = archives.filter(a => !a.fileData);

  const files: Array<{ name: string; data: Uint8Array }> = [];
  const records: string[] = [];
  const indiLinks = new Map<string, string[]>();
  const famLinks = new Map<string, string[]>();
  const addLink = (map: Map<string, string[]>, id: string, lines: string[]) => {
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push(...lines);
  };
  let personLinks = 0;
  let photoTags = 0;

  for (let i = 0; i < withFile.length; i++) {
    const a = withFile[i];
    const xref = `@O${i + 1}@`;
    const { mime, bytes } = dataUrlToBytes(a.fileData!);
    const name = `media/${String(i + 1).padStart(3, '0')}-${slug(a.title)}.${extensionFor(a, mime)}`;
    files.push({ name, data: bytes });

    const rec = [`0 ${xref} OBJE`, `1 FILE ${name}`, `2 FORM ${mime}`, `3 MEDI ${MEDI_BY_TYPE[a.type] || 'OTHER'}`];
    if ((MEDI_BY_TYPE[a.type] || 'OTHER') === 'OTHER') rec.push('4 PHRASE Document d\'archive');
    rec.push(...textLines(2, 'TITL', a.title));
    if (a.transcription) rec.push(...textLines(1, 'NOTE', a.transcription));
    rec.push(`1 _GN_ID ${a.id}`, `1 _GN_TYPE ${a.type}`);
    if (a.date) rec.push(...textLines(1, '_GN_DATE', a.date));
    if (a.place) rec.push(...textLines(1, '_GN_PLAC', a.place));
    if (a.archiveLocation) rec.push(...textLines(1, '_GN_REPO', a.archiveLocation));
    if (a.callNumber) rec.push(...textLines(1, '_GN_CALN', a.callNumber));
    if (a.republicanDate) rec.push(...textLines(1, '_GN_REPU', a.republicanDate));
    if (a.notes) rec.push(...textLines(1, '_GN_NOTE', a.notes));
    records.push(...rec);

    // Personnes liées au document (sans position)
    for (const pid of a.linkedPersonIds) {
      if (!data.individuals[pid]) continue;
      addLink(indiLinks, pid, [`1 OBJE ${xref}`]);
      personLinks++;
    }
    for (const fid of a.linkedFamilyIds) {
      if (data.families[fid]) addLink(famLinks, fid, [`1 OBJE ${xref}`]);
    }

    // Personnes identifiées sur la photo : zone CROP en pixels + position exacte en %
    const tags = (a.photoTags || []).filter(t => data.individuals[t.personId]);
    if (tags.length === 0) continue;
    const dims = await measure(a.fileData!);
    for (const [order, t] of tags.entries()) {
      const link = [`1 OBJE ${xref}`];
      if (dims) {
        const c = tagToCrop(t, dims);
        link.push('2 CROP', `3 TOP ${c.top}`, `3 LEFT ${c.left}`, `3 HEIGHT ${c.height}`, `3 WIDTH ${c.width}`);
      }
      if (t.label) link.push(...textLines(2, 'TITL', t.label));
      const pos = [t.x, t.y, ...(t.width && t.height ? [t.width, t.height] : [])].map(round2).join(' ');
      link.push(`2 _GN_POS ${pos}`);
      if (t.confidence) link.push(`2 _GN_CONF ${t.confidence}`);
      if (t.role) link.push(...textLines(2, '_GN_ROLE', t.role));
      // Ordre et identifiant du repère : la numérotation affichée sur la photo est conservée
      link.push(`2 _GN_ORDER ${order + 1}`, `2 _GN_ID ${t.id}`);
      addLink(indiLinks, t.personId, link);
      photoTags++;
    }
  }

  const { gedcom, report } = serializeGedcomWithReport(data, {
    hideLiving,
    version: '7.0',
    schemaTags: GEDZIP_SCHEMA_TAGS,
    extraIndividualLines: id => indiLinks.get(id) || [],
    extraFamilyLines: id => famLinks.get(id) || [],
    extraRecords: records,
  });

  const bytes = createZip([{ name: GEDZIP_DATASET, data: new TextEncoder().encode(gedcom + '\n') }, ...files]);
  return {
    bytes,
    gedcom,
    report: {
      individuals: report.totalIndividuals,
      families: report.totalFamilies,
      mediaFiles: files.length,
      personLinks,
      photoTags,
      skipped,
      maskedLiving: report.maskedLivingCount,
    },
  };
}

// --- Import ---

interface Node {
  level: number;
  xref?: string;
  tag: string;
  value: string;
  children: Node[];
}

/** Arbre des lignes GEDCOM ; les CONT/CONC sont recollés à la valeur de leur parent */
export function parseGedcomNodes(text: string): Node[] {
  const roots: Node[] = [];
  const stack: Node[] = [];
  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?: (.*))?$/.exec(rawLine);
    if (!m) continue;
    // Une valeur commençant par « @@ » est un « @ » échappé (GEDCOM 7)
    const node: Node = { level: Number(m[1]), xref: m[2], tag: m[3], value: (m[4] ?? '').replace(/^@@/, '@'), children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (node.tag === 'CONT' && parent) { parent.value += '\n' + node.value; continue; }
    if (node.tag === 'CONC' && parent) { parent.value += node.value; continue; }
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

const child = (n: Node, tag: string) => n.children.find(c => c.tag === tag);
const childValue = (n: Node, tag: string) => child(n, tag)?.value || undefined;

function decodePath(path: string): string {
  try { return decodeURIComponent(path); } catch { return path; }
}

export interface GedzipImportReport {
  individuals: number;
  families: number;
  documents: number;
  mediaFiles: number;
  photoTags: number;
  /** FILE référencés mais absents de l'archive (ou adresses web) */
  missingFiles: string[];
}

export async function readGedzip(
  bytes: Uint8Array,
  measure: MeasureImage = measureImageInBrowser
): Promise<{ data: GenealogyData; archives: ArchiveDocument[]; report: GedzipImportReport }> {
  const zip = await readZip(bytes);
  const datasetBytes = zip.get(GEDZIP_DATASET);
  if (!datasetBytes) throw new Error('Archive GEDZIP invalide : le fichier « gedcom.ged » est absent.');
  const text = new TextDecoder('utf-8').decode(datasetBytes);

  const data = parseGedcom(text);
  const nodes = parseGedcomNodes(text);
  const missingFiles: string[] = [];
  let mediaFiles = 0;

  // Enregistrements multimédias
  const docs = new Map<string, ArchiveDocument>();
  const dimsByXref = new Map<string, Dimensions | null>();
  let n = 0;
  for (const rec of nodes.filter(r => r.tag === 'OBJE' && r.xref)) {
    n++;
    const fileNode = child(rec, 'FILE');
    const path = fileNode?.value.trim() || '';
    const formNode = fileNode && child(fileNode, 'FORM');
    const medi = formNode && childValue(formNode, 'MEDI');
    const ext = path.match(/\.([a-z0-9]{1,5})$/i)?.[1]?.toLowerCase() || '';
    const mime = formNode?.value.trim() || MIME_BY_EXT[ext] || 'application/octet-stream';
    const fileBytes = path && !/^[a-z][a-z0-9+.-]*:/i.test(path) ? zip.get(decodePath(path)) : undefined;
    let fileData: string | undefined;
    if (fileBytes) {
      fileData = bytesToDataUrl(fileBytes, mime);
      mediaFiles++;
    } else if (path) {
      missingFiles.push(path);
    }

    const rawType = childValue(rec, '_GN_TYPE') as ArchiveDocumentType | undefined;
    const type: ArchiveDocumentType = rawType && ARCHIVE_TYPES.has(rawType) ? rawType : medi === 'PHOTO' ? 'photo' : 'other';
    const title = (fileNode && childValue(fileNode, 'TITL')) || path.split('/').pop() || `Document ${n}`;
    const doc: ArchiveDocument = {
      id: childValue(rec, '_GN_ID') || `doc-gdz-${Date.now()}-${n}`,
      title,
      type,
      linkedPersonIds: [],
      linkedFamilyIds: [],
      photoTags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(fileData ? { fileData, mimeType: mime, fileName: path.split('/').pop(), fileSize: fileBytes!.length } : {}),
    };
    const optional: Array<[keyof ArchiveDocument, string | undefined]> = [
      ['date', childValue(rec, '_GN_DATE')],
      ['place', childValue(rec, '_GN_PLAC')],
      ['archiveLocation', childValue(rec, '_GN_REPO')],
      ['callNumber', childValue(rec, '_GN_CALN')],
      ['republicanDate', childValue(rec, '_GN_REPU')],
      ['notes', childValue(rec, '_GN_NOTE')],
      ['transcription', rec.children.filter(c => c.tag === 'NOTE').map(c => c.value).join('\n\n') || undefined],
    ];
    for (const [key, value] of optional) if (value) (doc as any)[key] = value;
    docs.set(rec.xref!, doc);
  }

  // Liens depuis les fiches et les familles
  let photoTags = 0;
  const orderOf = new Map<PhotoTag, number>();
  for (const rec of nodes) {
    if (!rec.xref || (rec.tag !== 'INDI' && rec.tag !== 'FAM')) continue;
    for (const link of rec.children.filter(c => c.tag === 'OBJE')) {
      const doc = docs.get(link.value.trim());
      if (!doc) continue;
      if (rec.tag === 'FAM') {
        if (!doc.linkedFamilyIds.includes(rec.xref)) doc.linkedFamilyIds.push(rec.xref);
        continue;
      }
      const pos = childValue(link, '_GN_POS')?.split(/\s+/).map(Number);
      const crop = child(link, 'CROP');
      let tag: PhotoTag | null = null;
      if (pos && pos.length >= 2 && pos.every(Number.isFinite)) {
        tag = { id: '', personId: rec.xref, x: pos[0], y: pos[1], ...(pos.length >= 4 ? { width: pos[2], height: pos[3] } : {}) };
      } else if (crop && doc.fileData) {
        // Fichier d'un autre logiciel : zone CROP en pixels convertie en position (centre) et taille en %
        const linkXref = link.value.trim();
        if (!dimsByXref.has(linkXref)) dimsByXref.set(linkXref, await measure(doc.fileData));
        const dims = dimsByXref.get(linkXref);
        if (dims) {
          const num = (t: string) => Number(childValue(crop, t));
          const left = num('LEFT') || 0;
          const top = num('TOP') || 0;
          const width = num('WIDTH') || dims.width - left;
          const height = num('HEIGHT') || dims.height - top;
          tag = {
            id: '', personId: rec.xref,
            x: round2(((left + width / 2) / dims.width) * 100),
            y: round2(((top + height / 2) / dims.height) * 100),
            width: round2((width / dims.width) * 100),
            height: round2((height / dims.height) * 100),
          };
        }
      }
      if (tag) {
        const label = childValue(link, 'TITL');
        const conf = childValue(link, '_GN_CONF');
        const role = childValue(link, '_GN_ROLE');
        if (label) tag.label = label;
        if (conf === 'certain' || conf === 'probable' || conf === 'uncertain') tag.confidence = conf;
        if (role) tag.role = role;
        tag.id = childValue(link, '_GN_ID') || `tag-${doc.id}-${doc.photoTags!.length + 1}`;
        const order = Number(childValue(link, '_GN_ORDER'));
        if (Number.isFinite(order)) orderOf.set(tag, order);
        doc.photoTags!.push(tag);
        photoTags++;
      } else if (!doc.linkedPersonIds.includes(rec.xref)) {
        doc.linkedPersonIds.push(rec.xref);
      }
    }
  }

  // Repères dans leur ordre d'origine (sinon : ordre des fiches dans le fichier)
  for (const doc of docs.values()) {
    if (doc.photoTags!.some(t => orderOf.has(t))) {
      doc.photoTags!.sort((a, b) => (orderOf.get(a) ?? Infinity) - (orderOf.get(b) ?? Infinity));
    }
  }
  const archives = [...docs.values()];
  return {
    data,
    archives,
    report: {
      individuals: Object.keys(data.individuals).length,
      families: Object.keys(data.families).length,
      documents: archives.length,
      mediaFiles,
      photoTags,
      missingFiles,
    },
  };
}
