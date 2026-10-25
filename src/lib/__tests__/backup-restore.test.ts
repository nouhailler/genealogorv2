import { describe, it, expect } from 'vitest';
import { createFullBackup, previewBackup, restoreBackup, BACKUP_LIMITS } from '../backup-restore';
import { validateBackupPayload } from '../backup-validation';
import { getSampleGenealogy } from '../sample-data';
import { getDefaultArchives } from '../archive-store';

describe('Sauvegarde et Restauration Complète (P0 - Exigence 4.3)', () => {
  const sampleData = getSampleGenealogy();
  const sampleArchives = getDefaultArchives();
  const sampleAccess = [
    {
      id: 'acc-1',
      name: 'Branche Paternelle',
      branch: 'paternal' as const,
      rootPersonId: '@I1@',
      role: 'viewer' as const,
      hideLiving: true,
      shareToken: 'token12345678901234567890123456',
      createdAt: Date.now(),
    },
  ];

  it('doit générer un paquet de sauvegarde complet avec manifeste et empreinte SHA-256 valide', async () => {
    const backupJson = await createFullBackup(sampleData, sampleArchives, sampleAccess);
    expect(backupJson).toBeDefined();

    const preview = await previewBackup(backupJson);
    expect(preview.isValid).toBe(true);
    expect(preview.manifest?.format).toBe('genealogor-backup-v2');
    expect(preview.manifest?.stats.individualsCount).toBe(Object.keys(sampleData.individuals).length);
    expect(preview.manifest?.stats.archivesCount).toBe(sampleArchives.length);
    expect(preview.manifest?.checksumSha256.length).toBe(64);
    expect(preview.validationSummary?.verifiedRelationsCount).toBeGreaterThan(0);
  });

  it('doit rejeter une sauvegarde non chiffrée dont le contenu ou le checksum a été altéré', async () => {
    const backupJson = await createFullBackup(sampleData, sampleArchives, sampleAccess);
    const parsed = JSON.parse(backupJson);

    // Altérer une donnée
    parsed.payload.genealogy.individuals['@I1@'].name = 'Nom Falsifié';
    const tamperedJson = JSON.stringify(parsed);

    const preview = await previewBackup(tamperedJson);
    expect(preview.isValid).toBe(false);
    expect(preview.error).toContain('altéré');
  });

  it('doit chiffrer la sauvegarde avec une phrase secrète en format AES-GCM 256', async () => {
    const passphrase = 'PhraseSecreteFamiliale2026!';
    const encryptedBackupJson = await createFullBackup(sampleData, sampleArchives, sampleAccess, passphrase);

    const parsed = JSON.parse(encryptedBackupJson);
    expect(parsed.manifest.format).toBe('genealogor-backup-v2-encrypted');
    expect(parsed.manifest.isEncrypted).toBe(true);
    expect(parsed.payload).toBeUndefined();
    expect(parsed.encryptedPayload).toBeDefined();
    expect(parsed.encryptedPayload.startsWith('v2:')).toBe(true);

    // Sans mot de passe fourni, la prévisualisation doit signaler que l'archive est chiffrée
    const previewNoPwd = await previewBackup(encryptedBackupJson);
    expect(previewNoPwd.isValid).toBe(false);
    expect(previewNoPwd.isEncrypted).toBe(true);
    expect(previewNoPwd.error).toContain('phrase secrète');

    // Avec un mauvais mot de passe, doit rejeter proprement
    const previewBadPwd = await previewBackup(encryptedBackupJson, 'MauvaisMotDePasse');
    expect(previewBadPwd.isValid).toBe(false);
    expect(previewBadPwd.isEncrypted).toBe(true);
    expect(previewBadPwd.error).toContain('incorrecte');

    // Avec le bon mot de passe, doit valider et déchiffrer
    const previewGoodPwd = await previewBackup(encryptedBackupJson, passphrase);
    expect(previewGoodPwd.isValid).toBe(true);
    expect(previewGoodPwd.manifest?.checksumSha256.length).toBe(64);

    // Restauration réussie avec le bon mot de passe
    const restoreResult = await restoreBackup(encryptedBackupJson, sampleData, sampleArchives, sampleAccess, passphrase);
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.data?.genealogy.individuals['@I1@'].name).toBe(sampleData.individuals['@I1@'].name);
  });

  it('doit valider rigoureusement le schéma et rejeter un schéma corrompu', () => {
    // 1. Manque genealogy
    const invalidPayload1 = { archives: [], accessList: [] };
    const res1 = validateBackupPayload(invalidPayload1);
    expect(res1.isValid).toBe(false);
    expect(res1.schemaErrors.some(e => e.includes('genealogy'))).toBe(true);

    // 2. individuals n'est pas un dictionnaire
    const invalidPayload2 = {
      genealogy: { individuals: ['invalid-array'], families: {} },
      archives: [],
      accessList: [],
    };
    const res2 = validateBackupPayload(invalidPayload2);
    expect(res2.isValid).toBe(false);
    expect(res2.schemaErrors.some(e => e.includes('individuals'))).toBe(true);

    // 3. archives n'est pas un tableau
    const invalidPayload3 = {
      genealogy: { individuals: {}, families: {} },
      archives: 'not-an-array',
      accessList: [],
    };
    const res3 = validateBackupPayload(invalidPayload3);
    expect(res3.isValid).toBe(false);
    expect(res3.schemaErrors.some(e => e.includes('archives'))).toBe(true);
  });

  it('doit appliquer les limites de dimensionnement (taille brute et nombre d\'entités)', () => {
    // Dépassement taille de fichier (simulé via longueur de chaîne > 50 Mo)
    const resSize = validateBackupPayload({ genealogy: { individuals: {}, families: {} }, archives: [], accessList: [] }, BACKUP_LIMITS.MAX_FILE_BYTES + 100);
    expect(resSize.isValid).toBe(false);
    expect(resSize.schemaErrors.some(e => e.includes('excessive'))).toBe(true);

    // Dépassement nombre d'individus
    const hugeIndividuals: Record<string, any> = {};
    for (let i = 0; i <= BACKUP_LIMITS.MAX_INDIVIDUALS + 1; i++) {
      hugeIndividuals[`@I${i}@`] = { id: `@I${i}@`, name: `Ind ${i}` };
    }
    const resHuge = validateBackupPayload({
      genealogy: { individuals: hugeIndividuals, families: {} },
      archives: [],
      accessList: [],
    });
    expect(resHuge.isValid).toBe(false);
    expect(resHuge.schemaErrors.some(e => e.includes('individus excessif'))).toBe(true);
  });

  it('contrôle la cohérence relationnelle et répare automatiquement les réciprocités orphelines', () => {
    const rawPayload = {
      genealogy: {
        individuals: {
          '@I1@': {
            id: '@I1@',
            name: 'Jean Test',
            sex: 'M',
            familiesAsChild: ['@NON_EXISTENT_FAM@'], // Famille orpheline
            familiesAsSpouse: [],                    // Omet la famille @F1@ où il est époux
          },
          '@I2@': {
            id: '@I2@',
            name: 'Marie Enfant',
            sex: 'F',
            familiesAsChild: [],                     // Omet la famille @F1@ où elle est enfant
            familiesAsSpouse: [],
          },
        },
        families: {
          '@F1@': {
            id: '@F1@',
            husbandId: '@I1@',
            wifeId: '@GHOST_WIFE@',                  // Épouse fantôme
            childrenIds: ['@I2@', '@GHOST_CHILD@'],  // Enfant fantôme
          },
        },
      },
      archives: [
        {
          id: 'doc-1',
          title: 'Acte test',
          type: 'birth',
          linkedPersonIds: ['@I1@', '@GHOST_PERSON@'], // Personne liée fantôme
          linkedFamilyIds: ['@F1@', '@GHOST_FAM@'],    // Famille liée fantôme
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      accessList: [],
    };

    const res = validateBackupPayload(rawPayload);
    expect(res.isValid).toBe(true);

    // Les références orphelines doivent avoir généré des avertissements d'ajustement
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings.some(w => w.includes('@NON_EXISTENT_FAM@'))).toBe(true);
    expect(res.warnings.some(w => w.includes('@GHOST_WIFE@'))).toBe(true);
    expect(res.warnings.some(w => w.includes('@GHOST_CHILD@'))).toBe(true);
    expect(res.warnings.some(w => w.includes('@GHOST_PERSON@'))).toBe(true);

    // Réparation automatique de la réciprocité :
    // @I1@ doit maintenant contenir @F1@ dans ses familiesAsSpouse
    expect(res.sanitizedPayload?.genealogy.individuals['@I1@'].familiesAsSpouse).toContain('@F1@');
    // @I2@ doit maintenant contenir @F1@ dans ses familiesAsChild
    expect(res.sanitizedPayload?.genealogy.individuals['@I2@'].familiesAsChild).toContain('@F1@');

    // L'archive doit avoir été nettoyée des références inexistantes
    const sanitizedDoc = res.sanitizedPayload?.archives[0];
    expect(sanitizedDoc?.linkedPersonIds).toEqual(['@I1@']);
    expect(sanitizedDoc?.linkedFamilyIds).toEqual(['@F1@']);
  });

  it('doit restaurer fidèlement les données et créer la sauvegarde pré-restauration de sécurité', async () => {
    const backupJson = await createFullBackup(sampleData, sampleArchives, sampleAccess);

    const result = await restoreBackup(backupJson, sampleData, sampleArchives, sampleAccess);
    expect(result.success).toBe(true);
    expect(result.data?.genealogy.individuals['@I1@'].name).toBe(sampleData.individuals['@I1@'].name);
    expect(result.data?.archives.length).toBe(sampleArchives.length);
    expect(result.data?.accessList.length).toBe(sampleAccess.length);
  });

  describe('Qualité de la phrase secrète & Traitement des erreurs de chiffrement', () => {
    it('évalue rigoureusement la force de la phrase secrète et rejette les phrases faibles ou triviales', async () => {
      const { evaluatePassphraseQuality } = await import('../crypto');

      // Trop courte (< 8 car.)
      const shortRes = evaluatePassphraseQuality('court');
      expect(shortRes.isAcceptable).toBe(false);
      expect(shortRes.level).toBe('too_short');

      // Triviales courantes (dictionnaire commun)
      const trivialRes = evaluatePassphraseQuality('12345678');
      expect(trivialRes.isAcceptable).toBe(false);
      expect(trivialRes.level).toBe('weak');

      const azertyRes = evaluatePassphraseQuality('azerty123');
      expect(azertyRes.isAcceptable).toBe(false);

      // Moyenne (8+ car. avec lettres et chiffres)
      const mediumRes = evaluatePassphraseQuality('FamilleMartin2026');
      expect(mediumRes.isAcceptable).toBe(true);
      expect(mediumRes.score).toBeGreaterThanOrEqual(2);

      // Forte (12+ car. avec minuscules, majuscules, chiffres et symboles)
      const strongRes = evaluatePassphraseQuality('Genealogie#Martin_2026!Securite');
      expect(strongRes.isAcceptable).toBe(true);
      expect(strongRes.level).toBe('strong');
      expect(strongRes.score).toBeGreaterThanOrEqual(3);
    });

    it('gère proprement les erreurs de déchiffrement lors d\'un mot de passe erroné ou d\'un texte chiffré corrompu', async () => {
      const passphrase = 'PhraseRobusteFamiliale#2026!';
      const encryptedJson = await createFullBackup(sampleData, sampleArchives, sampleAccess, passphrase);

      // 1. Erreur avec mot de passe incorrect
      const wrongPwdPreview = await previewBackup(encryptedJson, 'MauvaisMotDePasse123!');
      expect(wrongPwdPreview.isValid).toBe(false);
      expect(wrongPwdPreview.error).toContain('incorrecte');

      // 2. Erreur avec payload chiffré corrompu
      const parsed = JSON.parse(encryptedJson);
      parsed.encryptedPayload = 'v2:saltcorrompu:ivcorrompu:donneescorrompues==';
      const corruptedJson = JSON.stringify(parsed);

      const corruptedPreview = await previewBackup(corruptedJson, passphrase);
      expect(corruptedPreview.isValid).toBe(false);
      expect(corruptedPreview.error).toContain('altérée');
    });

    it('conserve l\'export standard en JSON clair avec contrôle d\'intégrité SHA-256 sans chiffrement forcé', async () => {
      const plainBackup = await createFullBackup(sampleData, sampleArchives, sampleAccess, undefined);
      const parsed = JSON.parse(plainBackup);

      expect(parsed.manifest.format).toBe('genealogor-backup-v2');
      expect(parsed.manifest.isEncrypted).toBe(false);
      expect(parsed.payload).toBeDefined();
      expect(parsed.encryptedPayload).toBeUndefined();
      expect(parsed.payload.genealogy.individuals['@I1@'].name).toBe(sampleData.individuals['@I1@'].name);
      expect(parsed.manifest.checksumSha256.length).toBe(64);
    });
  });
});

