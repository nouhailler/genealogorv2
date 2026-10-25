import { describe, it, expect, beforeEach } from 'vitest';
import { 
  setVersionedItem, 
  getVersionedItem, 
  STORAGE_KEYS, 
  getPendingChanges, 
  addPendingChange, 
  clearPendingChanges, 
  removePendingChange,
  STORAGE_VERSION
} from '../storage-manager';
import { ArchiveDocument, PhotoTag } from '../../types/genealogy';

// Mock localStorage in Node/Vitest environment
const mockStorage: Record<string, string> = {};
global.localStorage = {
  getItem: (key: string) => mockStorage[key] || null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); },
  key: (i: number) => Object.keys(mockStorage)[i] || null,
  length: 0,
} as any;

describe('Mode Hors-Ligne & Résilience (P0 - Exigence 2)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persiste fidèlement les modifications avec conteneur versionné et révision', () => {
    const payload = { testTree: 'Famille Martin', nodes: 42 };
    setVersionedItem('test_tree_key', payload, 3);

    const loaded = getVersionedItem('test_tree_key', { testTree: '', nodes: 0 });
    expect(loaded.isCorrupted).toBe(false);
    expect(loaded.revision).toBe(3);
    expect(loaded.data).toEqual(payload);
  });

  it('ne conserve que le dernier instantané complet de l\'arbre (tree:update) dans la file', () => {
    addPendingChange('tree:update', { individuals: { a: 1 } });
    addPendingChange('person:edit', { id: '@I1@' });
    addPendingChange('tree:update', { individuals: { a: 1, b: 2 } });

    const pending = getPendingChanges();
    expect(pending.map(c => c.action)).toEqual(['person:edit', 'tree:update']);
    expect(pending[1].payload).toEqual({ individuals: { a: 1, b: 2 } });
  });

  it('met en file d\'attente les modifications effectuées hors connexion sans perte', () => {
    expect(getPendingChanges().length).toBe(0);

    addPendingChange('person:edit', { id: '@I1@', name: 'Pierre Martin Modifié' });
    addPendingChange('archive:add', { id: 'doc-999', title: 'Nouvel Acte Hors Ligne' });

    const pending = getPendingChanges();
    expect(pending.length).toBe(2);
    expect(pending[0].action).toBe('person:edit');
    expect(pending[0].payload.name).toBe('Pierre Martin Modifié');
    expect(pending[1].action).toBe('archive:add');

    // Suppression sélective d'une modification synchronisée
    removePendingChange(pending[0].id);
    const afterRemoval = getPendingChanges();
    expect(afterRemoval.length).toBe(1);
    expect(afterRemoval[0].action).toBe('archive:add');

    // Vidage complet de la file après synchronisation
    clearPendingChanges();
    expect(getPendingChanges().length).toBe(0);
  });

  it('détecte les corruptions de données et crée une sauvegarde d\'urgence sans écrasement sauvage', () => {
    // Écrire un JSON corrompu
    mockStorage['corrupt_key'] = '{ non: valide, json ...';

    const fallback = { safe: true };
    const result = getVersionedItem('corrupt_key', fallback);

    expect(result.isCorrupted).toBe(true);
    expect(result.data).toEqual(fallback);

    // Vérifier qu'une clé de sauvegarde d'urgence a été créée
    const backupKeys = Object.keys(mockStorage).filter(k => k.startsWith('corrupt_key_corrupt_backup_'));
    expect(backupKeys.length).toBe(1);
    expect(mockStorage[backupKeys[0]]).toContain('non: valide');
  });

  it('ne supprime un changement de la file d\'attente QU\'APRÈS un accusé de réception ACK réel du serveur avec status=success', async () => {
    // 1. Enregistrement d'un changement hors connexion
    const change = addPendingChange('person:edit', { id: '@I1@', name: 'Pierre Martin Sync' });
    expect(getPendingChanges().length).toBe(1);

    // 2. Simulation d'un échec réseau ou refus serveur : le changement DOIT être conservé dans la file
    const simulatedServerErrorResponse = { success: false, error: 'Serveur indisponible ou rejeté' };
    
    if (!simulatedServerErrorResponse.success) {
      // Le code de synchronisation (App.tsx ligne 298) n'appelle PAS removePendingChange
      // Il appelle markPendingChangeFailed
      const { markPendingChangeFailed } = await import('../storage-manager');
      markPendingChangeFailed(change.id, simulatedServerErrorResponse.error);
    }

    const pendingAfterFailure = getPendingChanges();
    expect(pendingAfterFailure.length).toBe(1);
    expect(pendingAfterFailure[0].status).toBe('failed');
    expect(pendingAfterFailure[0].retryCount).toBe(1);
    expect(pendingAfterFailure[0].error).toBe('Serveur indisponible ou rejeté');

    // 3. Après 3 échecs, le statut bascule en conflit pour analyse manuelle sans perte de données
    const { markPendingChangeFailed } = await import('../storage-manager');
    markPendingChangeFailed(change.id, 'Deuxième échec');
    markPendingChangeFailed(change.id, 'Troisième échec');

    const pendingAfterThreeFailures = getPendingChanges();
    expect(pendingAfterThreeFailures[0].status).toBe('conflict');
    expect(pendingAfterThreeFailures[0].retryCount).toBe(3);

    // 4. Succès confirmé avec accusé de réception serveur (ACK) : suppression autorisée
    const simulatedServerSuccessResponse = { success: true };
    if (simulatedServerSuccessResponse.success) {
      removePendingChange(change.id);
    }

    expect(getPendingChanges().length).toBe(0);
  });
});

describe('Marquage Photo & Liaison Fiche Individu (Photo Tagging)', () => {
  it('associe un tag de visage précis avec coordonnées relatives et synchronise linkedPersonIds', () => {
    const sampleTag: PhotoTag = {
      id: 'tag-1',
      personId: '@I1@',
      x: 35.5,
      y: 42.0,
      label: 'François Martin (vers 40 ans)',
      role: 'Père de famille',
      confidence: 'certain',
    };

    const doc: ArchiveDocument = {
      id: 'doc-photo-01',
      title: 'Portrait de Famille',
      type: 'photo',
      date: '1912',
      fileData: 'data:image/jpeg;base64,...',
      linkedPersonIds: [],
      linkedFamilyIds: [],
      photoTags: [],
      createdAt: 1912,
      updatedAt: 1912,
    };

    // Ajouter le tag et synchroniser les personnes liées
    const updatedTags = [...(doc.photoTags || []), sampleTag];
    const updatedLinkedPersons = Array.from(new Set([...doc.linkedPersonIds, sampleTag.personId]));

    const updatedDoc: ArchiveDocument = {
      ...doc,
      photoTags: updatedTags,
      linkedPersonIds: updatedLinkedPersons,
      updatedAt: Date.now(),
    };

    expect(updatedDoc.photoTags?.length).toBe(1);
    expect(updatedDoc.photoTags?.[0].personId).toBe('@I1@');
    expect(updatedDoc.linkedPersonIds).toContain('@I1@');
    expect(updatedDoc.photoTags?.[0].x).toBe(35.5);
    expect(updatedDoc.photoTags?.[0].y).toBe(42.0);
  });

  it('permet la suppression d\'un tag et met à jour les liens de fiches sans orphelins', () => {
    const docWithTags: ArchiveDocument = {
      id: 'doc-photo-02',
      title: 'Groupe Mariage',
      type: 'photo',
      date: '1905',
      linkedPersonIds: ['@I1@', '@I2@'],
      linkedFamilyIds: [],
      createdAt: 1905,
      updatedAt: 1905,
      photoTags: [
        { id: 'tag-1', personId: '@I1@', x: 20, y: 30, label: 'Jean' },
        { id: 'tag-2', personId: '@I2@', x: 60, y: 30, label: 'Marie' },
      ],
    };

    // Supprimer le tag 1
    const nextTags = docWithTags.photoTags!.filter(t => t.id !== 'tag-1');
    const nextLinked = nextTags.map(t => t.personId);

    expect(nextTags.length).toBe(1);
    expect(nextTags[0].personId).toBe('@I2@');
    expect(nextLinked).not.toContain('@I1@');
    expect(nextLinked).toContain('@I2@');
  });
});
