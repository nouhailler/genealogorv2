import { describe, it, expect } from 'vitest';
import { parseGedcom } from '../gedcom-parser';
import {
  buildShareSnapshot,
  sealSnapshot,
  openSnapshot,
  wrapShareKey,
  unwrapShareKey,
  generateSecureShareToken,
  generateShareKey,
  buildShareUrl,
  readShareParams,
  stripShareSecrets,
  isFirestoreShare,
  snapshotFingerprint,
} from '../share-snapshot';
import { ArchiveDocument, BranchAccess } from '../../types/genealogy';

// Racine @I1@ (née en 1995, vivante) ; père @I2@ et mère @I3@ ;
// grand-père paternel @I4@, grand-mère maternelle @I5@
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
1 FAMC @F2@
0 @I3@ INDI
1 NAME Marie /Palem/
1 SEX F
1 BIRT
2 DATE 1907
1 DEAT
2 DATE 1998
1 FAMS @F1@
1 FAMC @F3@
0 @I4@ INDI
1 NAME Jean /Coste/
1 SEX M
1 BIRT
2 DATE 1870
1 DEAT
2 DATE 1940
1 FAMS @F2@
0 @I5@ INDI
1 NAME Louise /Vigneau/
1 SEX F
1 BIRT
2 DATE 1880
1 DEAT
2 DATE 1950
1 FAMS @F3@
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I1@
0 @F2@ FAM
1 HUSB @I4@
1 CHIL @I2@
0 @F3@ FAM
1 WIFE @I5@
1 CHIL @I3@
0 TRLR
`;

const data = { ...parseGedcom(GED), rootPersonId: '@I1@', sourceHeader: 'Famille Coste' };

const archives: ArchiveDocument[] = [
  {
    id: 'doc-1', title: 'Acte de naissance de Jean', type: 'birth',
    fileData: 'data:image/png;base64,AAAA', linkedPersonIds: ['@I4@'], linkedFamilyIds: [],
    createdAt: 0, updatedAt: 0,
  },
  {
    id: 'doc-2', title: 'Acte de Louise', type: 'birth',
    linkedPersonIds: ['@I5@'], linkedFamilyIds: [], createdAt: 0, updatedAt: 0,
  },
];

function access(overrides: Partial<BranchAccess> = {}): BranchAccess {
  return {
    id: 'acc-1', name: 'Cousins', branch: 'all', rootPersonId: '@I1@', role: 'viewer',
    hideLiving: true, shareToken: generateSecureShareToken(), shareKey: generateShareKey(),
    createdAt: 0, ...overrides,
  };
}

describe('Partage par lien Firestore (instantané chiffré)', () => {
  it('chiffre puis rouvre l\'instantané à l\'identique avec la bonne clé', async () => {
    const acc = access();
    const snapshot = buildShareSnapshot(data, archives, acc);
    const payload = await sealSnapshot(snapshot, acc.shareKey!);

    expect(payload.startsWith('v2:')).toBe(true);
    expect(payload).not.toContain('Coste');
    expect(await openSnapshot(payload, acc.shareKey!)).toEqual(snapshot);
  });

  it('refuse d\'ouvrir l\'instantané avec une autre clé', async () => {
    const acc = access();
    const payload = await sealSnapshot(buildShareSnapshot(data, archives, acc), acc.shareKey!);
    await expect(openSnapshot(payload, generateShareKey())).rejects.toThrow();
  });

  it('protège la clé par le mot de passe du lien', async () => {
    const key = generateShareKey();
    const wrapped = await wrapShareKey(key, 'Courtazelle1802');
    expect(await unwrapShareKey(wrapped, 'Courtazelle1802')).toBe(key);
    await expect(unwrapShareKey(wrapped, 'mauvais')).rejects.toThrow();
  });

  it('ne publie que la branche paternelle et ses archives', () => {
    const snapshot = buildShareSnapshot(data, archives, access({ branch: 'paternal' }));
    const ids = Object.keys(snapshot.tree.individuals);
    expect(ids).toContain('@I2@');
    expect(ids).toContain('@I4@');
    expect(ids).not.toContain('@I5@');
    expect(snapshot.archives.map(a => a.id)).toEqual(['doc-1']);
  });

  it('anonymise les vivants si demandé et retire les fichiers image', () => {
    const hidden = buildShareSnapshot(data, archives, access({ hideLiving: true }));
    expect(hidden.tree.individuals['@I1@'].name).not.toContain('Gabrielle');
    expect(hidden.tree.individuals['@I2@'].name).toBe('Henri Coste');
    expect(hidden.archives.every(a => a.fileData === undefined)).toBe(true);

    const visible = buildShareSnapshot(data, archives, access({ hideLiving: false }));
    expect(visible.tree.individuals['@I1@'].name).toBe('Gabrielle Coste');
  });

  it('compresse un arbre volumineux sous la limite Firestore', async () => {
    const acc = access({ hideLiving: false });
    const big = { ...data, individuals: { ...data.individuals } };
    for (let i = 0; i < 3000; i++) {
      big.individuals[`@X${i}@`] = { ...data.individuals['@I4@'], id: `@X${i}@`, name: `Ancêtre ${i} Coste` };
    }
    const payload = await sealSnapshot(buildShareSnapshot(big, [], acc), acc.shareKey!);
    expect(payload.length).toBeLessThan(900_000);
  });

  it('génère des jetons conformes aux règles Firestore et imprévisibles', () => {
    const t1 = generateSecureShareToken();
    const t2 = generateSecureShareToken();
    expect(t1).toMatch(/^[a-zA-Z0-9_\-]{20,128}$/);
    expect(t1).not.toBe(t2);
  });

  it('met la clé dans le fragment uniquement pour un lien sans mot de passe', () => {
    const open = access();
    expect(buildShareUrl('https://genealogor.swinux.ch/', open))
      .toBe(`https://genealogor.swinux.ch/?share=${open.shareToken}#k=${open.shareKey}`);

    const locked = access({ wrappedKey: 'v2:xxx' });
    expect(buildShareUrl('https://genealogor.swinux.ch/', locked)).not.toContain('#k=');
  });

  it('lit le jeton et la clé depuis l\'URL', () => {
    expect(readShareParams('?share=shr-abcdefghijklmnop', '#k=CLE_secrete-1'))
      .toEqual({ token: 'shr-abcdefghijklmnop', key: 'CLE_secrete-1' });
    expect(readShareParams('?room=famille', '')).toBeNull();
    expect(readShareParams('?share=../etc', '')).toBeNull();
  });

  it('ne diffuse jamais la clé secrète et reconnaît les anciens liens', () => {
    const acc = access();
    expect(stripShareSecrets([acc])[0]).not.toHaveProperty('shareKey');
    expect(isFirestoreShare(acc)).toBe(true);
    expect(isFirestoreShare({ ...acc, shareKey: undefined })).toBe(false);
  });

  it('l\'empreinte ignore la date de génération mais détecte un changement de contenu', async () => {
    const acc = access();
    const s1 = buildShareSnapshot(data, archives, acc);
    const s2 = { ...s1, generatedAt: '2030-01-01T00:00:00.000Z' };
    expect(await snapshotFingerprint(s1)).toBe(await snapshotFingerprint(s2));
    const s3 = buildShareSnapshot({ ...data, sourceHeader: 'Autre titre' }, archives, acc);
    expect(await snapshotFingerprint(s3)).not.toBe(await snapshotFingerprint(s1));
  });
});
