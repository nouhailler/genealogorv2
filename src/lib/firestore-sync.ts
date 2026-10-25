import { 
  doc, 
  setDoc, 
  collection, 
  onSnapshot, 
  deleteDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from './firebase';
import { GenealogyData, ArchiveDocument, BranchAccess } from '../types/genealogy';
import type { ShareDocument } from './share-snapshot';
import { User } from 'firebase/auth';

export async function saveTreeToFirestore(
  treeId: string, 
  data: GenealogyData, 
  currentUser: User | null
): Promise<void> {
  if (!currentUser) return;
  const path = `trees/${treeId}`;
  try {
    const treeRef = doc(db, 'trees', treeId);
    await setDoc(treeRef, {
      treeId,
      ownerId: currentUser.uid,
      ownerEmail: currentUser.email || '',
      title: data.sourceHeader || 'Arbre Familial',
      rootPersonId: data.rootPersonId || '',
      individuals: data.individuals,
      families: data.families,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToTree(
  treeId: string, 
  onUpdate: (data: GenealogyData) => void,
  onMissingDoc?: () => void
): () => void {
  const path = `trees/${treeId}`;
  const treeRef = doc(db, 'trees', treeId);

  return onSnapshot(treeRef, (snapshot) => {
    if (snapshot.exists()) {
      const val = snapshot.data();
      if (val && val.individuals && val.families) {
        onUpdate({
          individuals: val.individuals,
          families: val.families,
          rootPersonId: val.rootPersonId,
          sourceHeader: val.title,
        });
      }
    } else if (onMissingDoc) {
      onMissingDoc();
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
}

export async function saveArchiveToFirestore(
  treeId: string, 
  archive: ArchiveDocument, 
  currentUser: User | null
): Promise<void> {
  if (!currentUser) return;
  const path = `trees/${treeId}/archives/${archive.id}`;
  try {
    const archiveRef = doc(db, 'trees', treeId, 'archives', archive.id);
    await setDoc(archiveRef, {
      ...archive,
      createdBy: currentUser.uid,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteArchiveFromFirestore(
  treeId: string, 
  archiveId: string,
  currentUser: User | null
): Promise<void> {
  if (!currentUser) return;
  const path = `trees/${treeId}/archives/${archiveId}`;
  try {
    const archiveRef = doc(db, 'trees', treeId, 'archives', archiveId);
    await deleteDoc(archiveRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearTreeFromFirestore(
  treeId: string, 
  currentUser: User | null
): Promise<void> {
  if (!currentUser) return;
  const path = `trees/${treeId}`;
  try {
    const treeRef = doc(db, 'trees', treeId);
    await setDoc(treeRef, {
      treeId,
      ownerId: currentUser.uid,
      ownerEmail: currentUser.email || '',
      title: 'Mon Arbre Généalogique',
      rootPersonId: '',
      individuals: {},
      families: {},
      updatedAt: new Date().toISOString(),
    });

    // Supprimer les actes de démonstration de la sous-collection archives
    const sampleDocIds = ['doc-001', 'doc-002', 'doc-003', 'doc-004'];
    for (const id of sampleDocIds) {
      try {
        await deleteDoc(doc(db, 'trees', treeId, 'archives', id));
      } catch (e) {}
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTreeFromFirestore(
  treeId: string, 
  currentUser: User | null
): Promise<void> {
  if (!currentUser) return;
  const path = `trees/${treeId}`;
  try {
    // Les sous-collections ne sont pas supprimées avec le document parent :
    // on les vide d'abord, tant que le parent existe encore (règles Firestore).
    for (const sub of ['archives', 'access']) {
      const snap = await getDocs(collection(db, 'trees', treeId, sub));
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    }
    const treeRef = doc(db, 'trees', treeId);
    await deleteDoc(treeRef);
    await deleteSharesOfTree(treeId, currentUser);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Publie (ou remplace) l'instantané chiffré d'un lien de partage : `/shares/{jeton}`.
 */
export async function publishShareToFirestore(
  token: string,
  shareDoc: ShareDocument,
  currentUser: User | null
): Promise<void> {
  if (!currentUser) throw new Error('Connexion Google requise pour publier un lien de partage.');
  const path = `shares/${token}`;
  try {
    await setDoc(doc(db, 'shares', token), shareDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteShareFromFirestore(token: string, currentUser: User | null): Promise<void> {
  if (!currentUser) return;
  const path = `shares/${token}`;
  try {
    await deleteDoc(doc(db, 'shares', token));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/** Supprime tous les liens de partage publiés pour un arbre (suppression de l'arbre) */
export async function deleteSharesOfTree(treeId: string, currentUser: User | null): Promise<void> {
  if (!currentUser) return;
  const snap = await getDocs(query(
    collection(db, 'shares'),
    where('ownerId', '==', currentUser.uid),
    where('treeId', '==', treeId)
  ));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
}

/**
 * Lecture publique d'un instantané par son jeton (aucune connexion requise), avec mises à jour en direct.
 */
export function subscribeToShare(
  token: string,
  onUpdate: (shareDoc: ShareDocument | null) => void,
  onError: (error: unknown) => void
): () => void {
  return onSnapshot(
    doc(db, 'shares', token),
    snap => onUpdate(snap.exists() ? (snap.data() as ShareDocument) : null),
    onError
  );
}

export function subscribeToArchives(
  treeId: string, 
  onUpdate: (archives: ArchiveDocument[]) => void
): () => void {
  const path = `trees/${treeId}/archives`;
  const archivesCol = collection(db, 'trees', treeId, 'archives');

  return onSnapshot(archivesCol, (snapshot) => {
    const list: ArchiveDocument[] = [];
    snapshot.forEach(docSnap => {
      list.push(docSnap.data() as ArchiveDocument);
    });
    onUpdate(list);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export async function saveAccessToFirestore(
  treeId: string, 
  access: BranchAccess,
  currentUser: User | null
): Promise<void> {
  if (!currentUser) return;
  const path = `trees/${treeId}/access/${access.id}`;
  try {
    const ref = doc(db, 'trees', treeId, 'access', access.id);
    const { password, ...safeAccess } = access as any;
    await setDoc(ref, safeAccess, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAccessFromFirestore(
  treeId: string,
  accessId: string,
  currentUser: User | null
): Promise<void> {
  if (!currentUser) return;
  const path = `trees/${treeId}/access/${accessId}`;
  try {
    const ref = doc(db, 'trees', treeId, 'access', accessId);
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function revokeAccessInFirestore(
  treeId: string,
  accessId: string,
  currentUser: User | null
): Promise<void> {
  if (!currentUser) return;
  const path = `trees/${treeId}/access/${accessId}`;
  try {
    const ref = doc(db, 'trees', treeId, 'access', accessId);
    await setDoc(ref, { revoked: true, updatedAt: Date.now() }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToAccessList(
  treeId: string, 
  onUpdate: (list: BranchAccess[]) => void
): () => void {
  const path = `trees/${treeId}/access`;
  const col = collection(db, 'trees', treeId, 'access');

  return onSnapshot(col, (snapshot) => {
    const list: BranchAccess[] = [];
    snapshot.forEach(docSnap => {
      list.push(docSnap.data() as BranchAccess);
    });
    if (list.length > 0) {
      onUpdate(list);
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, path);
  });
}

export interface TreeFirestoreSummary {
  id: string;
  title: string;
  ownerId?: string;
  ownerEmail?: string;
  rootPersonId?: string;
  updatedAt?: string;
  personCount?: number;
}

/**
 * Récupère la liste des arbres Firestore accessibles pour l'utilisateur connecté
 */
export async function listUserTreesFromFirestore(
  currentUser: User | null
): Promise<TreeFirestoreSummary[]> {
  if (!currentUser) return [];
  const path = 'trees';
  try {
    const treesCol = collection(db, 'trees');
    const isAdminUser = currentUser.email === 'jeanpierre.nouhailler@gmail.com';
    const q = isAdminUser 
      ? query(treesCol)
      : query(treesCol, where('ownerId', '==', currentUser.uid));

    const snapshot = await getDocs(q);
    const result: TreeFirestoreSummary[] = [];

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const personCount = data.individuals ? Object.keys(data.individuals).length : 0;
      result.push({
        id: docSnap.id,
        title: data.title || docSnap.id,
        ownerId: data.ownerId,
        ownerEmail: data.ownerEmail,
        rootPersonId: data.rootPersonId,
        updatedAt: data.updatedAt,
        personCount,
      });
    });

    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

