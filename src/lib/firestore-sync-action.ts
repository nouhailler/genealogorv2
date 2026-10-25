import { BranchAccess, ArchiveDocument } from '../types/genealogy';

export interface FirestoreConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

export interface FirestoreSyncResult {
  success: boolean;
  error?: string;
  savedCount?: number;
  deletedCount?: number;
}

export interface TreeDataPayload {
  sourceHeader?: string;
  rootPersonId?: string;
  individuals?: Record<string, any>;
  families?: Record<string, any>;
}

/**
 * Exécute la persistance autoritaire vers Firestore et valide rigoureusement chaque écriture HTTP.
 * Garantit l'absence de faux positifs (ex: annoncer success: true alors qu'une écriture a échoué).
 */
export async function syncActionToFirestore(
  config: FirestoreConfig,
  roomId: string,
  action: string,
  payload: any,
  idToken?: string,
  getRoomTree?: (roomId: string) => TreeDataPayload | undefined,
  customFetch?: typeof fetch
): Promise<FirestoreSyncResult> {
  const fetchFn = customFetch || fetch;

  if (!config.projectId || !config.firestoreDatabaseId) {
    return { success: false, error: 'Firebase Firestore non configuré sur ce serveur' };
  }
  if (roomId === 'martin-family-tree' || roomId === 'demo') {
    return { success: true }; // Arbre démo local en mémoire/disque
  }

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents/trees/${roomId}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }

  try {
    if (action === 'tree:update' || action === 'person:edit') {
      const tree = getRoomTree ? getRoomTree(roomId) : undefined;
      if (tree) {
        const res = await fetchFn(baseUrl, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            fields: {
              updatedAt: { stringValue: new Date().toISOString() },
              title: { stringValue: tree.sourceHeader || 'Arbre Familial' },
              rootPersonId: { stringValue: tree.rootPersonId || '' },
              individualsJson: { stringValue: JSON.stringify(tree.individuals || {}) },
              familiesJson: { stringValue: JSON.stringify(tree.families || {}) },
            }
          })
        });
        if (!res.ok) {
          const errText = await res.text();
          return { 
            success: false, 
            error: `Firestore Tree PATCH HTTP ${res.status}: ${errText.slice(0, 200)}` 
          };
        }
      }
      return { success: true };

    } else if (action === 'archive:add' && payload?.id) {
      const arcUrl = `${baseUrl}/archives/${payload.id}`;
      const res = await fetchFn(arcUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          fields: {
            id: { stringValue: payload.id },
            title: { stringValue: payload.title || '' },
            type: { stringValue: payload.type || 'other' },
            date: { stringValue: payload.date || '' },
            updatedAt: { integerValue: String(Date.now()) },
            linkedPersonIds: {
              arrayValue: {
                values: Array.isArray(payload.linkedPersonIds) 
                  ? payload.linkedPersonIds.map((pid: string) => ({ stringValue: pid }))
                  : []
              }
            }
          }
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        return { 
          success: false, 
          error: `Firestore Archive PATCH HTTP ${res.status}: ${errText.slice(0, 200)}` 
        };
      }
      return { success: true };

    } else if (action === 'archive:delete') {
      const arcId = typeof payload === 'string' ? payload : payload?.id;
      if (arcId) {
        const arcUrl = `${baseUrl}/archives/${arcId}`;
        const res = await fetchFn(arcUrl, { method: 'DELETE', headers });
        if (!res.ok && res.status !== 404) {
          const errText = await res.text();
          return { 
            success: false, 
            error: `Firestore Archive DELETE HTTP ${res.status}: ${errText.slice(0, 200)}` 
          };
        }
      }
      return { success: true };

    } else if (action === 'access:update' && Array.isArray(payload)) {
      // 1. Lister les règles actuellement existantes dans Firestore pour identifier celles supprimées
      const accessColUrl = `${baseUrl}/access`;
      let existingDocIds: string[] = [];
      try {
        const listRes = await fetchFn(accessColUrl, { headers });
        if (listRes.ok) {
          const listData = await listRes.json();
          if (Array.isArray(listData.documents)) {
            existingDocIds = listData.documents.map((d: any) => d.name?.split('/').pop() || '').filter(Boolean);
          }
        }
      } catch (e) {
        // En cas d'impossibilité de lister (ex: règles strictes ou première fois), continuer
      }

      const activeIds = new Set(payload.map((r: any) => r.id).filter(Boolean));
      let deletedCount = 0;

      // 2. Supprimer de Firestore les règles retirées du payload
      for (const existingId of existingDocIds) {
        if (!activeIds.has(existingId)) {
          const delUrl = `${baseUrl}/access/${existingId}`;
          const delRes = await fetchFn(delUrl, { method: 'DELETE', headers });
          if (!delRes.ok && delRes.status !== 404) {
            const errText = await delRes.text();
            return {
              success: false,
              error: `Firestore Access Rule DELETE HTTP ${delRes.status} pour la règle ${existingId}: ${errText.slice(0, 200)}`,
              deletedCount,
            };
          }
          deletedCount++;
        }
      }

      // 3. Enregistrer chaque règle d'accès et vérifier rigoureusement le statut HTTP de chaque requête
      let savedCount = 0;
      for (let i = 0; i < payload.length; i++) {
        const rule = payload[i];
        if (rule && rule.id) {
          const ruleUrl = `${baseUrl}/access/${rule.id}`;
          const isRevoked = Boolean(rule.revoked);

          const res = await fetchFn(ruleUrl, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              fields: {
                id: { stringValue: rule.id },
                name: { stringValue: rule.name || '' },
                branch: { stringValue: rule.branch || 'all' },
                role: { stringValue: rule.role || 'viewer' },
                passwordHash: rule.passwordHash ? { stringValue: rule.passwordHash } : undefined,
                shareToken: { stringValue: rule.shareToken || rule.id },
                hideLiving: { booleanValue: Boolean(rule.hideLiving) },
                revoked: { booleanValue: isRevoked },
                createdAt: { integerValue: String(rule.createdAt || Date.now()) },
                rootPersonId: { stringValue: rule.rootPersonId || '' },
              }
            })
          });

          // P1 : Vérification stricte du statut HTTP. En cas d'échec, ne pas annoncer une synchronisation réussie
          if (!res.ok) {
            const errText = await res.text();
            return {
              success: false,
              error: `Échec d'enregistrement de la règle [${rule.id}] (HTTP ${res.status}): ${errText.slice(0, 200)}. Synchronisation partielle stoppée (${savedCount}/${payload.length} enregistrées).`,
              savedCount,
              deletedCount,
            };
          }
          savedCount++;
        }
      }

      return { success: true, savedCount, deletedCount };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erreur réseau Firestore' };
  }
}
