/**
 * Lecture et écriture d'archives ZIP, sans dépendance (format GEDZIP de GEDCOM 7).
 *
 * - Écriture : méthode « stockée » (sans compression). Les photos JPEG/PNG et les PDF sont déjà
 *   compressés ; la spécification GEDZIP recommande de ne pas les recompresser.
 * - Lecture : méthodes « stockée » et « deflate » (produite par la plupart des outils), via
 *   DecompressionStream('deflate-raw').
 * - Noms de fichiers en UTF-8 (bit 11 des drapeaux), comme l'exige GEDZIP. Pas de ZIP64 (< 4 Gio).
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const UTF8_FLAG = 0x0800;

/** Construit une archive ZIP (méthode stockée) */
export function createZip(entries: ZipEntry[], now = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const names = new Set<string>();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (names.has(entry.name)) throw new Error(`Nom en double dans l'archive : ${entry.name}`);
    names.add(entry.name);
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);          // version nécessaire
    lv.setUint16(6, UTF8_FLAG, true);
    lv.setUint16(8, 0, true);           // méthode : stockée
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);          // version créatrice
    cv.setUint16(6, 20, true);
    cv.setUint16(8, UTF8_FLAG, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, entry.data);
    centrals.push(central);
    offset += local.length + size;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  if (offset + centralSize > 0xffffffff) throw new Error('Archive trop volumineuse (plus de 4 Gio).');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + 22);
  let pos = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Décompression ZIP indisponible dans ce navigateur.');
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Lit une archive ZIP (méthodes stockée et deflate) ; renvoie les fichiers par nom */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fin du répertoire central : cherchée depuis la fin (commentaire de 64 Kio au plus)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Ce fichier n\'est pas une archive ZIP valide.');

  const count = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  if (count === 0xffff || pos === 0xffffffff) throw new Error('Archive ZIP64 non prise en charge.');

  const utf8 = new TextDecoder('utf-8');
  const latin1 = new TextDecoder('latin1');
  const files = new Map<string, Uint8Array>();

  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('Répertoire de l\'archive ZIP corrompu.');
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const crc = view.getUint32(pos + 16, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const rawName = bytes.subarray(pos + 46, pos + 46 + nameLen);
    // GEDZIP impose l'UTF-8 ; les anciens outils sans le drapeau sont lus en Latin-1
    const name = (flags & UTF8_FLAG ? utf8 : latin1).decode(rawName);
    pos += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // dossier
    if (flags & 0x0001) throw new Error(`Fichier chiffré non pris en charge dans l'archive : ${name}`);

    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`Entrée ZIP corrompue : ${name}`);
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = bytes.subarray(start, start + compressedSize);

    let data: Uint8Array;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error(`Méthode de compression ZIP non prise en charge (${method}) : ${name}`);

    if (crc32(data) !== crc) throw new Error(`Contrôle d'intégrité échoué pour « ${name} » : archive altérée.`);
    files.set(name, data);
  }
  return files;
}
