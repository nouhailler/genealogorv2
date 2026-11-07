import { describe, it, expect } from 'vitest';
import { resolvePortrait, firstFramedFace, squareCrop, boxFromCorners, hasFrame } from '../portrait';
import { ArchiveDocument } from '../../types/genealogy';

const photo = (id: string, tags: ArchiveDocument['photoTags'], fileData = 'data:image/jpeg;base64,AAAA'): ArchiveDocument => ({
  id, title: id, type: 'photo', fileData, linkedPersonIds: [], linkedFamilyIds: [], photoTags: tags, createdAt: 0, updatedAt: 0,
});

const mariage = photo('doc-mariage', [
  { id: 't-point', personId: '@I1@', x: 30, y: 30 },
  { id: 't-cadre', personId: '@I1@', x: 40, y: 35, width: 8, height: 12 },
  { id: 't-autre', personId: '@I2@', x: 70, y: 30, width: 6, height: 9 },
]);
const byId = new Map([[mariage.id, mariage]]);

describe('resolvePortrait', () => {
  it('retrouve la photo et le cadre du visage', () => {
    const r = resolvePortrait({ portrait: { archiveId: 'doc-mariage', tagId: 't-cadre' } }, byId);
    expect(r).toEqual({
      src: mariage.fileData,
      box: { x: 40, y: 35, width: 8, height: 12 },
      ref: { archiveId: 'doc-mariage', tagId: 't-cadre' },
    });
  });

  it("revient à l'initiale si la photo, le repère ou le cadre n'existent plus", () => {
    expect(resolvePortrait({}, byId)).toBeNull();
    expect(resolvePortrait({ portrait: { archiveId: 'supprimée', tagId: 't-cadre' } }, byId)).toBeNull();
    expect(resolvePortrait({ portrait: { archiveId: 'doc-mariage', tagId: 'absent' } }, byId)).toBeNull();
    expect(resolvePortrait({ portrait: { archiveId: 'doc-mariage', tagId: 't-point' } }, byId)).toBeNull(); // repère sans cadre
    const sansImage = { ...photo('doc-x', mariage.photoTags), fileData: undefined };
    expect(resolvePortrait({ portrait: { archiveId: 'doc-x', tagId: 't-cadre' } }, new Map([['doc-x', sansImage]]))).toBeNull();
  });
});

describe('firstFramedFace', () => {
  it('propose le premier visage cadré de la personne', () => {
    expect(firstFramedFace('@I1@', [mariage])).toEqual({ archiveId: 'doc-mariage', tagId: 't-cadre' });
    expect(firstFramedFace('@I9@', [mariage])).toBeNull();
  });
});

describe('géométrie', () => {
  it('normalise un cadre dessiné dans n\'importe quel sens et le borne à l\'image', () => {
    expect(boxFromCorners(50, 40, 30, 20)).toEqual({ x: 40, y: 30, width: 20, height: 20 });
    expect(boxFromCorners(-10, 95, 10, 120)).toEqual({ x: 5, y: 97.5, width: 10, height: 5 });
  });

  it('découpe un carré centré sur le visage, sans sortir de l\'image', () => {
    // Image 2000×1000, cadre centré (40 %, 35 %) de 8 % × 12 % = 160 × 120 px → carré de 160 px
    expect(squareCrop({ x: 40, y: 35, width: 8, height: 12 }, 2000, 1000)).toEqual({ sx: 720, sy: 270, side: 160 });
    // Visage collé au bord droit : le carré est ramené dans l'image
    const edge = squareCrop({ x: 99, y: 50, width: 10, height: 10 }, 1000, 1000);
    expect(edge.sx + edge.side).toBeLessThanOrEqual(1000);
    expect(edge.side).toBe(100);
  });

  it('reconnaît un repère cadré', () => {
    expect(hasFrame({ id: 'a', personId: 'p', x: 1, y: 1 })).toBe(false);
    expect(hasFrame({ id: 'a', personId: 'p', x: 1, y: 1, width: 5, height: 5 })).toBe(true);
  });
});
