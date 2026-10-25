import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, encryptData, decryptData, generateShareToken } from '../crypto';

describe('Cryptographie et gestion des secrets (P0 - Exigence 3.4)', () => {
  it('doit chiffrer et déchiffrer fidèlement les données avec mot de passe correct', async () => {
    const secretText = JSON.stringify({ arbre: 'Famille Martin', ancetre: 'François Martin', annee: 1742 });
    const password = 'SecretFamilial2026!';

    const encrypted = await encryptData(secretText, password);
    expect(encrypted.startsWith('v2:')).toBe(true);

    const decrypted = await decryptData(encrypted, password);
    expect(decrypted).toBe(secretText);
  });

  it('doit générer un sel et un IV différents à chaque opération de chiffrement (pas de réutilisation d\'IV)', async () => {
    const text = 'Donnée identique chiffrée deux fois';
    const password = 'MonMotDePasse';

    const enc1 = await encryptData(text, password);
    const enc2 = await encryptData(text, password);

    expect(enc1).not.toBe(enc2);
  });

  it('doit échouer proprement au déchiffrement avec un mauvais mot de passe', async () => {
    const text = 'Données confidentielles';
    const encrypted = await encryptData(text, 'BonMotDePasse');

    await expect(decryptData(encrypted, 'MauvaisMotDePasse')).rejects.toThrow();
  });

  it('doit échouer au déchiffrement si le texte chiffré est altéré (intégrité AES-GCM)', async () => {
    const text = 'Données intègres';
    const password = 'ClefDeChiffrement';
    const encrypted = await encryptData(text, password);

    // Altérer quelques caractères au milieu
    const raw = encrypted.slice(3);
    const altered = 'v2:' + raw.slice(0, 10) + 'X' + raw.slice(11);

    await expect(decryptData(altered, password)).rejects.toThrow();
  });

  it('doit hacher et vérifier les mots de passe de façon sécurisée (PBKDF2 avec sel)', async () => {
    const pwd = 'MotDePasseBranche123';
    const hash = await hashPassword(pwd);

    expect(hash.startsWith('pbkdf2:v2:')).toBe(true);
    expect(await verifyPassword(pwd, hash)).toBe(true);
    expect(await verifyPassword('FauxMotDePasse', hash)).toBe(false);
  });

  it('doit générer des jetons de partage uniques et non vides', () => {
    const token1 = generateShareToken();
    const token2 = generateShareToken();
    expect(token1.length).toBe(32);
    expect(token1).not.toBe(token2);
  });
});
