import React, { useState, useEffect, useMemo } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { TreeView } from './components/views/TreeView';
import { ProfileView } from './components/views/ProfileView';
import { ArchivesView } from './components/views/ArchivesView';
import { TimelineView } from './components/views/TimelineView';
import { GeoMapView } from './components/views/GeoMapView';
import { StatsView } from './components/views/StatsView';
import { ShareModal } from './components/ShareModal';
import { ExportImportModal } from './components/ExportImportModal';
import { EditPersonModal } from './components/views/EditPersonModal';
import { MergeModal } from './components/views/MergeModal';
import { PassphraseScreen } from './components/PassphraseScreen';
import { HamburgerMenu } from './components/HamburgerMenu';
import { SystemSettingsModal } from './components/SystemSettingsModal';
import { OnboardingModal, hasAcceptedOnboarding } from './components/OnboardingModal';
import { ContextualGuide } from './components/ContextualGuide';
import { TreeManagerModal } from './components/TreeManagerModal';
import { FirstTimeTreeWizard } from './components/FirstTimeTreeWizard';
import { SharedLinkStatus } from './components/SharedLinkStatus';
import { ChangeAlertBanner } from './components/ChangeAlertBanner';
import {
  ChangeEvent,
  TreeState,
  diffTreeStates,
  appendChanges,
  loadAlertState,
  saveAlertState,
  getUnreadChanges,
  allReadState,
  AlertReadState,
} from './lib/change-log';
import {
  readShareParams,
  buildShareSnapshot,
  snapshotFingerprint,
  sealSnapshot,
  openSnapshot,
  unwrapShareKey,
  isFirestoreShare,
  stripShareSecrets,
  SHARE_FORMAT_VERSION,
  ShareDocument,
} from './lib/share-snapshot';
import { FanChartView } from './components/views/FanChartView';
import { DescendantsView } from './components/views/DescendantsView';
import { ImplexView } from './components/views/ImplexView';
import { ValidationView } from './components/views/ValidationView';
import { CompareView } from './components/views/CompareView';
import { ForceGraphView } from './components/views/ForceGraphView';
import { DepartmentDirectoryModal } from './components/views/DepartmentDirectoryModal';
import { getStoredTheme, applyTheme, toggleTheme, ThemeMode } from './lib/theme';
import { 
  getStoredCurrentRoom, 
  setStoredCurrentRoom, 
  recordKnownTree,
  markTreeCreatedLocally,
  isTreeCreatedLocally,
  isFirstAppUse,
  getKnownTrees
} from './lib/tree-manager';

import { GenealogyData, Individual, ArchiveDocument, BranchAccess, BranchRole, BranchScope } from './types/genealogy';
import { createEmptyGenealogy } from './lib/sample-data';
import { getStoredArchives, saveStoredArchives, clearStoredArchives } from './lib/archive-store';
import { filterGenealogyData } from './lib/branch-filter';
import { realtimeClient, isJsonResponse } from './lib/realtime-client';
import { verifyPassword } from './lib/crypto';
import { validateChronology } from './lib/validation';
import { 
  sanitizePersonForPrivacy, 
  sanitizeGenealogyDataForPrivacy, 
  sanitizeArchivesForPrivacy, 
  getProtectedPersonIds,
  shouldProtectPerson 
} from './lib/privacy';
import { 
  STORAGE_KEYS, 
  setVersionedItem, 
  getVersionedItem, 
  addPendingChange, 
  getPendingChanges, 
  clearPendingChanges,
  updatePendingChange,
  markPendingChangeFailed,
  removePendingChange
} from './lib/storage-manager';
// Les jetons de salle sont émis et signés exclusivement côté serveur via /api/auth/room-token
import { 
  auth, 
  loginWithGoogle, 
  logoutUser, 
  testFirestoreConnection,
  firebaseProjectId,
  checkRedirectAuth
} from './lib/firebase';
import { AuthErrorModal, AuthErrorInfo } from './components/AuthErrorModal';

import { 
  saveTreeToFirestore, 
  subscribeToTree, 
  saveArchiveToFirestore, 
  deleteArchiveFromFirestore, 
  subscribeToArchives, 
  saveAccessToFirestore, 
  deleteAccessFromFirestore,
  subscribeToAccessList,
  clearTreeFromFirestore,
  publishShareToFirestore,
  deleteShareFromFirestore,
  subscribeToShare
} from './lib/firestore-sync';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { Shield, Sparkles, Database, GitMerge, AlertTriangle, Trash2 } from 'lucide-react';

// Lien de partage Firestore (`?share=<jeton>#k=<clé>`) : consultation en lecture seule, sans compte
const SHARE_PARAMS = typeof window !== 'undefined'
  ? readShareParams(window.location.search, window.location.hash)
  : null;

type SharedViewState =
  | { status: 'loading' }
  | { status: 'locked'; doc: ShareDocument }
  | { status: 'ready'; title: string; shareName: string; generatedAt: string }
  | { status: 'missing' | 'no-key' | 'error'; message?: string };

export default function App() {
  const isSharedView = Boolean(SHARE_PARAMS);
  // Real-time synchronization state & Active tree room
  const [roomId, setRoomId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const roomParam = urlParams.get('room');
      if (SHARE_PARAMS) return `shared-${SHARE_PARAMS.token}`;
      if (roomParam) return roomParam;
    }
    return getStoredCurrentRoom();
  });

  // Main state with versioned storage & recovery partitioned per tree room
  const [data, setData] = useState<GenealogyData>(() => {
    const fallback = createEmptyGenealogy(roomId);
    const roomKey = `${STORAGE_KEYS.TREE}_${roomId}`;
    const res = getVersionedItem<GenealogyData>(roomKey, fallback);
    return res.data;
  });

  const [archives, setArchives] = useState<ArchiveDocument[]>(() => {
    const roomKey = `${STORAGE_KEYS.ARCHIVES}_${roomId}`;
    const res = getVersionedItem<ArchiveDocument[]>(roomKey, []);
    return res.data;
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('tree');
  const [selectedPersonId, setSelectedPersonId] = useState<string>(() => data.rootPersonId || Object.keys(data.individuals)[0] || '');
  const [selectedArchiveId, setSelectedArchiveId] = useState<string>('');

  // Firebase Auth & Cloud Sync state
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);

  // Modals state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Individual | null>(null);
  const [isHamburgerOpen, setIsHamburgerOpen] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(() => !hasAcceptedOnboarding());
  const [isTreeManagerOpen, setIsTreeManagerOpen] = useState(false);
  const [isDeptDirectoryOpen, setIsDeptDirectoryOpen] = useState(false);
  // Arbre à alimenter via l'étape 2 de l'assistant (import .GED depuis le gestionnaire d'arbres)
  const [gedcomTargetTree, setGedcomTargetTree] = useState<{ id: string; title: string; personCount?: number } | null>(null);
  // Première utilisation (aucun arbre créé, pas de lien partagé) : assistant « 1. Créer l'arbre → 2. Importer le .GED »
  const [isFirstTreeWizardOpen, setIsFirstTreeWizardOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return !SHARE_PARAMS && !urlParams.get('room') && !urlParams.get('token') && isFirstAppUse();
  });

  // Thème Sombre / Clair / Système
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  const handleToggleTheme = () => {
    const next = toggleTheme(themeMode);
    setThemeMode(next);
    showToast(`Thème : ${next === 'dark' ? 'Sombre' : next === 'light' ? 'Clair' : 'Automatique (système)'}`);
  };

  // Access control & Private branch links
  const [accessList, setAccessList] = useState<BranchAccess[]>(() => {
    const res = getVersionedItem<BranchAccess[]>(`${STORAGE_KEYS.ACCESS}_${roomId}`, []);
    return res.data;
  });

  const [currentBranchScope, setCurrentBranchScope] = useState<BranchScope>('all');
  
  // Profil 1 (Créateur/Admin) vs Profil 2 (Lecteur - par défaut lors du partage)
  const [userRole, setUserRole] = useState<BranchRole>(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const roleParam = urlParams.get('role') as BranchRole | null;
      const roomParam = urlParams.get('room');

      if (roleParam === 'viewer') return 'viewer';
      if (roleParam === 'admin') return 'admin';
      if (roleParam === 'editor') return 'editor';

      // Règle absolue : si l'utilisateur rejoint un arbre via un lien partagé et ne l'a pas créé, Profil Lecteur par défaut
      if (roomParam && !isTreeCreatedLocally(roomParam)) {
        return 'viewer';
      }

      if (roomParam && isTreeCreatedLocally(roomParam)) {
        return 'admin';
      }
    }
    // Arbre initial personnel créé sur cet appareil
    return 'admin';
  });

  const [isUnlocked, setIsUnlocked] = useState<boolean>(true);
  const [pendingBranchAccess, setPendingBranchAccess] = useState<BranchAccess | null>(null);

  const [connectedPeerCount, setConnectedPeerCount] = useState<number>(1);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);
  // Relais Express/WebSocket absent (hébergement statique type Cloudflare) : mode local + Firestore uniquement
  const [isRelayAvailable, setIsRelayAvailable] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<AuthErrorInfo | null>(null);

  // Marquer l'arbre initial comme créé si l'utilisateur n'arrive pas via un lien partagé
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      // Pas de marquage implicite tant que l'assistant de premier arbre n'a pas été complété
      if (!SHARE_PARAMS && !urlParams.get('room') && !urlParams.get('token') && !isFirstTreeWizardOpen) {
        markTreeCreatedLocally(roomId);
      }
    }
  }, [roomId, isFirstTreeWizardOpen]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Changement / Création d'arbre généalogique fluide
  const handleSwitchTree = async (newRoomId: string, newTitle?: string, initialData?: GenealogyData) => {
    if (!newRoomId) return;
    if (isSharedView && !initialData) {
      // Quitter la consultation d'un lien partagé pour revenir à ses propres arbres
      window.location.href = `${window.location.pathname}?room=${encodeURIComponent(newRoomId)}`;
      return;
    }
    setRoomId(newRoomId);
    setStoredCurrentRoom(newRoomId);

    // Mettre à jour l'URL sans recharger brutalement la page
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('room', newRoomId);
      url.searchParams.delete('token');
      url.searchParams.delete('branch');
      url.searchParams.delete('role');
      window.history.pushState({}, '', url.toString());
    }

    // Réinitialiser le périmètre de consultation
    setCurrentBranchScope('all');
    setIsUnlocked(true);
    setPendingBranchAccess(null);

    // Si initialData est présent, l'arbre vient d'être créé par l'utilisateur
    if (initialData) {
      markTreeCreatedLocally(newRoomId);
      setUserRole('admin');
    } else {
      const isCreator = isTreeCreatedLocally(newRoomId);
      setUserRole(isCreator ? 'admin' : 'viewer');
    }

    const roomTreeKey = `${STORAGE_KEYS.TREE}_${newRoomId}`;
    const roomArchKey = `${STORAGE_KEYS.ARCHIVES}_${newRoomId}`;
    const roomAccessKey = `${STORAGE_KEYS.ACCESS}_${newRoomId}`;

    const targetData = initialData || getVersionedItem<GenealogyData>(roomTreeKey, createEmptyGenealogy(newTitle || newRoomId)).data;
    const targetArchives = getVersionedItem<ArchiveDocument[]>(roomArchKey, []).data;
    const targetAccess = getVersionedItem<BranchAccess[]>(roomAccessKey, []).data;

    setData(targetData);
    setArchives(targetArchives);
    setAccessList(targetAccess);
    setSelectedPersonId(targetData.rootPersonId || Object.keys(targetData.individuals)[0] || '');

    if (initialData) {
      setVersionedItem(roomTreeKey, initialData);
      setVersionedItem(STORAGE_KEYS.TREE, initialData);
      if (currentUser) {
        try {
          await saveTreeToFirestore(newRoomId, initialData, currentUser);
        } catch (e) {
          console.warn('Erreur synchronisation Firestore nouvel arbre:', e);
        }
      }
      recordKnownTree({
        id: newRoomId,
        title: newTitle || initialData.sourceHeader || newRoomId,
        personCount: Object.keys(initialData.individuals).length,
        lastOpenedAt: Date.now(),
      });
      showToast(`Arbre activé : ${newTitle || initialData.sourceHeader || newRoomId}`);
    } else {
      recordKnownTree({
        id: newRoomId,
        title: newTitle || targetData.sourceHeader || newRoomId,
        personCount: Object.keys(targetData.individuals).length,
        lastOpenedAt: Date.now(),
      });
      showToast(`Arbre activé : ${newTitle || newRoomId}`);
    }
  };

  // Chronological anomalies detection
  const anomalies = useMemo(() => validateChronology(data), [data]);

  // ── Journal des modifications & alertes ──────────────────────────────────────
  // Créateur : le journal est déduit des changements successifs de l'arbre et conservé par arbre.
  // Destinataire d'un lien : le journal arrive avec l'instantané partagé, mis à jour en direct.
  const changeLogKey = (id: string) => `genealogor_changes_v1_${id}`;
  const [changeLog, setChangeLog] = useState<ChangeEvent[]>(() =>
    isSharedView ? [] : getVersionedItem<ChangeEvent[]>(changeLogKey(roomId), []).data
  );
  const alertScope = isSharedView ? `share-${SHARE_PARAMS!.token}` : roomId;
  const [alertState, setAlertState] = useState<AlertReadState | null>(() => loadAlertState(alertScope));
  const [archiveFocusNonce, setArchiveFocusNonce] = useState(0);
  const baselineRef = React.useRef<{ roomId: string; state: TreeState } | null>(null);

  useEffect(() => {
    if (isSharedView) return;
    setChangeLog(getVersionedItem<ChangeEvent[]>(changeLogKey(roomId), []).data);
    setAlertState(loadAlertState(roomId));
  }, [roomId]);

  useEffect(() => {
    if (isSharedView) return;
    const current: TreeState = { data, archives };
    const baseline = baselineRef.current;
    baselineRef.current = { roomId, state: current };
    // Premier rendu ou changement d'arbre : nouvelle référence, pas d'alerte
    if (!baseline || baseline.roomId !== roomId) return;
    const events = diffTreeStates(baseline.state, current);
    if (events.length === 0) return;
    setChangeLog(prev => {
      const next = appendChanges(prev, events);
      setVersionedItem(changeLogKey(roomId), next);
      return next;
    });
    // Ses propres modifications ne déclenchent pas d'alerte sur cet appareil
    setAlertState(prev => {
      const next = allReadState(events, prev);
      saveAlertState(roomId, next);
      return next;
    });
  }, [data, archives, roomId]);

  const unreadChanges = useMemo(() => getUnreadChanges(changeLog, alertState), [changeLog, alertState]);

  const handleOpenChange = (change: ChangeEvent) => {
    setAlertState(prev => {
      const base = prev || { lastSeenAt: 0, readIds: [] };
      const next = { ...base, readIds: [...base.readIds, change.id].slice(-200) };
      saveAlertState(alertScope, next);
      return next;
    });
    if (change.targetType === 'person') {
      setSelectedPersonId(change.targetId);
      setActiveTab('profile');
    } else {
      setSelectedArchiveId(change.targetId);
      setArchiveFocusNonce(n => n + 1);
      setActiveTab('archives');
    }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleMarkAllChangesRead = () => {
    const next = allReadState(changeLog, alertState);
    setAlertState(next);
    saveAlertState(alertScope, next);
  };

  // 1. Initialize Firebase Auth and Connection Verification
  useEffect(() => {
    testFirestoreConnection().then(ok => {
      if (ok) setIsCloudSynced(true);
    });

    // Check if coming back from a redirect Google sign-in
    checkRedirectAuth().catch((err: any) => {
      console.warn('Redirect sign-in error:', err);
      const code = err?.code || 'auth/unknown';
      if (code === 'auth/unauthorized-domain' || code === 'auth/popup-blocked') {
        setAuthError({
          code,
          message: err?.message || 'Erreur d’authentification.',
          currentDomain: window.location.hostname,
          firebaseProjectId,
        });
      }
    });

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user) {
        showToast(`Connecté avec Google : ${user.displayName || user.email}`);
        setIsCloudSynced(true);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Subscribe to Firestore ONLY when auth is ready and user is authenticated
  useEffect(() => {
    if (isSharedView || !authReady || !currentUser || !roomId) return;

    const unsubTree = subscribeToTree(
      roomId, 
      (remoteData) => {
        if (remoteData) {
          setData(remoteData);
          setVersionedItem(`${STORAGE_KEYS.TREE}_${roomId}`, remoteData);
          setVersionedItem(STORAGE_KEYS.TREE, remoteData);
          setIsCloudSynced(true);
          setSelectedPersonId(prev => prev || remoteData.rootPersonId || Object.keys(remoteData.individuals)[0] || '');
          recordKnownTree({
            id: roomId,
            title: remoteData.sourceHeader || roomId,
            personCount: Object.keys(remoteData.individuals).length,
            lastOpenedAt: Date.now(),
          });
        }
      },
      () => {
        // Le document n'existe pas encore dans Firestore : ne sauvegarder que si des données ont été saisies
        if (currentUser && Object.keys(data.individuals).length > 0) {
          saveTreeToFirestore(roomId, data, currentUser).then(() => {
            setIsCloudSynced(true);
          }).catch(console.warn);
        }
      }
    );

    const unsubArch = subscribeToArchives(roomId, (remoteArchives) => {
      if (remoteArchives) {
        setArchives(remoteArchives);
        setVersionedItem(`${STORAGE_KEYS.ARCHIVES}_${roomId}`, remoteArchives);
        setVersionedItem(STORAGE_KEYS.ARCHIVES, remoteArchives);
        setIsCloudSynced(true);
      }
    });

    const unsubAccess = subscribeToAccessList(roomId, (remoteAccess) => {
      if (remoteAccess) {
        setAccessList(remoteAccess);
        setVersionedItem(`${STORAGE_KEYS.ACCESS}_${roomId}`, remoteAccess);
        setVersionedItem(STORAGE_KEYS.ACCESS, remoteAccess);
      }
    });

    return () => {
      unsubTree();
      unsubArch();
      unsubAccess();
    };
  }, [authReady, currentUser, roomId]);

  // 3. Check URL parameters for private share links on initial load
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const tokenParam = urlParams.get('token');
    const branchParam = urlParams.get('branch') as BranchScope | null;
    const roleParam = urlParams.get('role') as BranchRole | null;

    if (roomParam) {
      setRoomId(roomParam);
      // Si la salle a été partagée et non créée localement par cet utilisateur, Profil Lecteur par défaut
      if (!isTreeCreatedLocally(roomParam) && roleParam !== 'admin') {
        setUserRole(roleParam || 'viewer');
      }
    }

    if (tokenParam) {
      const matchingAccess = accessList.find(a => a.shareToken === tokenParam);
      if (matchingAccess) {
        if (matchingAccess.passwordHash || matchingAccess.password) {
          setIsUnlocked(false);
          setPendingBranchAccess(matchingAccess);
        } else {
          setCurrentBranchScope(matchingAccess.branch);
          setUserRole(matchingAccess.role || 'viewer');
          setIsUnlocked(true);
        }
      } else if (branchParam) {
        setCurrentBranchScope(branchParam);
        setUserRole(roleParam || 'viewer');
        setIsUnlocked(true);
      }
    } else if (roleParam) {
      setUserRole(roleParam);
    }
  }, [accessList]);

  // 4. Initialisation sécurisée de la connexion WebSocket temps réel
  useEffect(() => {
    // Vue partagée : instantané Firestore uniquement, aucun relais temps réel
    if (isSharedView) return;
    let isCancelled = false;
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const invitationToken = urlParams?.get('token') || pendingBranchAccess?.shareToken || '';

    const setupConnection = async () => {
      let token = '';
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (currentUser) {
          const idToken = await currentUser.getIdToken();
          headers['Authorization'] = `Bearer ${idToken}`;
        }

        const res = await fetch('/api/auth/room-token', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            roomId,
            invitationToken: invitationToken || undefined,
            userName: currentUser?.displayName || undefined,
          }),
        });

        // Hébergement statique : /api/* renvoie la page HTML de l'application au lieu de JSON
        if (!isJsonResponse(res)) {
          setIsRelayAvailable(false);
          return;
        }
        setIsRelayAvailable(true);

        if (res.ok) {
          const authData = await res.json();
          if (authData.token) {
            token = authData.token;
            if (authData.role && authData.role !== userRole) {
              setUserRole(authData.role);
            }
            if (authData.branch && authData.branch !== currentBranchScope) {
              setCurrentBranchScope(authData.branch);
            }
          }
        }
      } catch (err) {
        // Pas de serveur relais joignable : inutile de tenter le WebSocket en boucle
        console.warn('Relais temps réel indisponible, mode local + Firestore :', err);
        setIsRelayAvailable(false);
        return;
      }

      if (isCancelled) return;

      realtimeClient.init(
        roomId, 
        currentUser?.displayName || (userRole === 'admin' ? 'Administrateur' : userRole === 'editor' ? 'Éditeur' : 'Visiteur'),
        currentBranchScope,
        token
      );
    };

    setupConnection();

    const unsubConn = realtimeClient.on('connection:change', async (info) => {
      setIsWsConnected(info.connected);
      if (info.connected) {
        // P1 : Traitement résilient des modifications en attente avec acquittement ACK individuel
        const pending = getPendingChanges();
        if (pending.length > 0) {
          let syncedCount = 0;
          for (const change of pending) {
            // Éviter de renvoyer en boucle si déjà en conflit
            if (change.retryCount >= 3) continue;

            updatePendingChange(change.id, { status: 'syncing', lastAttempt: Date.now() });
            const res = await realtimeClient.sendActionWithAck(change.action, change.payload, change.id);
            if (res.success) {
              removePendingChange(change.id);
              syncedCount++;
            } else {
              markPendingChangeFailed(change.id, res.error);
              console.warn(`Échec de confirmation pour la modification ${change.id}:`, res.error);
            }
          }

          if (syncedCount > 0) {
            showToast(`${syncedCount} modification(s) hors-ligne synchronisée(s) et acquittée(s).`);
          }

          // Persistance Firestore traitée comme un canal distinct du simple relais WebSocket
          if (currentUser) {
            try {
              await saveTreeToFirestore(roomId, data, currentUser);
              setIsCloudSynced(true);
            } catch (e) {
              console.warn('Persistance Firestore en arrière-plan:', e);
            }
          }
        }
      }
    });

    const unsubRoomDeleted = realtimeClient.on('room:deleted', () => {
      setIsWsConnected(false);
      showToast("Cet arbre a été supprimé par son administrateur. Les modifications ne sont plus partagées.");
    });

    const unsubRoom = realtimeClient.on('room:info', (info) => {
      setConnectedPeerCount(info.peerCount || 1);
    });

    const unsubPeerJoined = realtimeClient.on('peer:joined', (info) => {
      setConnectedPeerCount(info.peerCount || 2);
      showToast(`${info.userName || 'Un membre de la famille'} a rejoint l'arbre.`);
    });

    const unsubPeerLeft = realtimeClient.on('peer:left', (info) => {
      setConnectedPeerCount(info.peerCount || 1);
    });

    const unsubSync = realtimeClient.on('sync:action', (msg) => {
      if (msg.action === 'tree:update' && msg.payload) {
        const payloadData = userRole === 'viewer'
          ? sanitizeGenealogyDataForPrivacy(msg.payload)
          : msg.payload;
        setData(payloadData);
        setVersionedItem(STORAGE_KEYS.TREE, payloadData);
        showToast('Arbre généalogique synchronisé en direct.');
      } else if (msg.action === 'person:edit' && msg.payload) {
        let updatedInd = msg.payload as Individual;
        if (userRole === 'viewer' && shouldProtectPerson(updatedInd)) {
          updatedInd = sanitizePersonForPrivacy(updatedInd);
        }
        setData(prev => {
          const next = {
            ...prev,
            individuals: { ...prev.individuals, [updatedInd.id]: updatedInd }
          };
          setVersionedItem(STORAGE_KEYS.TREE, next);
          return next;
        });
        showToast(`Fiche de ${updatedInd.name} mise à jour en direct.`);
      } else if (msg.action === 'archive:add' && msg.payload) {
        const newArchive = msg.payload as ArchiveDocument;
        if (userRole === 'viewer') {
          const protectedIds = getProtectedPersonIds(data);
          const sanitizedList = sanitizeArchivesForPrivacy([newArchive], protectedIds);
          if (sanitizedList.length === 0) return; // Ne pas intégrer l'archive privée
        }
        setArchives(prev => {
          const next = [newArchive, ...prev.filter(a => a.id !== newArchive.id)];
          setVersionedItem(STORAGE_KEYS.ARCHIVES, next);
          return next;
        });
        showToast(`Nouvel acte numérisé ajouté : ${newArchive.title}`);
      }
    });

    return () => {
      unsubConn();
      unsubRoom();
      unsubPeerJoined();
      unsubPeerLeft();
      unsubRoomDeleted();
      unsubSync();
    };
  }, [roomId, currentBranchScope, userRole, currentUser]);

  // Auth Handlers
  const handleLogin = async () => {
    try {
      setAuthError(null);
      await loginWithGoogle();
    } catch (e: any) {
      console.error('Erreur connexion Google:', e);
      const code = e?.code || 'auth/unknown';
      const msg = e?.message || 'Erreur inconnue';

      // Unauthorized domain, popup blocked, or other configuration error
      if (
        code === 'auth/unauthorized-domain' || 
        code === 'auth/popup-blocked' || 
        code === 'auth/operation-not-allowed' ||
        code === 'auth/internal-error'
      ) {
        setAuthError({
          code,
          message: msg,
          currentDomain: window.location.hostname,
          firebaseProjectId,
        });
      } else if (code === 'auth/popup-closed-by-user') {
        showToast('Connexion annulée : la fenêtre Google a été fermée.');
      } else {
        // Show detailed toast
        showToast(`Erreur (${code}) : vérifiez la configuration Google.`);
        setAuthError({
          code,
          message: msg,
          currentDomain: window.location.hostname,
          firebaseProjectId,
        });
      }
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      showToast('Déconnecté.');
    } catch (e) {
      console.error(e);
    }
  };

  // Handle unlocking via passphrase
  const handleUnlockWithPassword = async (enteredPassword: string): Promise<boolean> => {
    if (!pendingBranchAccess) return false;
    let isValid = false;

    if (pendingBranchAccess.passwordHash) {
      isValid = await verifyPassword(enteredPassword, pendingBranchAccess.passwordHash);
    } else if (pendingBranchAccess.password) {
      isValid = enteredPassword === pendingBranchAccess.password;
    }

    if (isValid) {
      setCurrentBranchScope(pendingBranchAccess.branch);
      setUserRole(pendingBranchAccess.role);
      setIsUnlocked(true);
      showToast(`Accès déverrouillé : ${pendingBranchAccess.name}`);
      return true;
    }
    return false;
  };

  // Branch & privacy filtering: get active tree data for current viewer
  const effectiveData = useMemo(() => {
    // L'instantané partagé est déjà filtré (branche) et anonymisé selon le choix du créateur
    if (isSharedView) return data;
    const rootId = data.rootPersonId || Object.keys(data.individuals)[0] || '';
    if (userRole === 'admin' && currentBranchScope === 'all') {
      return data;
    }
    const hideLiving = userRole !== 'admin';
    return filterGenealogyData(data, rootId, currentBranchScope, hideLiving);
  }, [data, currentBranchScope, userRole]);

  // Branch & privacy filtering: get active archives matching visible individuals and privacy rules
  const effectiveArchives = useMemo(() => {
    if (isSharedView) return archives;
    let active = archives;
    if (currentBranchScope !== 'all') {
      const allowedIds = new Set(Object.keys(effectiveData.individuals));
      active = archives.filter(arc =>
        arc.linkedPersonIds.length === 0 || arc.linkedPersonIds.some(id => allowedIds.has(id))
      );
    }
    if (userRole !== 'admin') {
      const protectedIds = getProtectedPersonIds(data);
      return sanitizeArchivesForPrivacy(active, protectedIds);
    }
    return active;
  }, [archives, currentBranchScope, effectiveData, userRole, data]);

  // Archive count per person
  const archiveCountByPerson = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const doc of archives) {
      for (const pId of doc.linkedPersonIds) {
        counts[pId] = (counts[pId] || 0) + 1;
      }
    }
    return counts;
  }, [archives]);

  // Handlers for modifying tree & archives with Firestore sync + realtime broadcast
  const handleUpdatePerson = async (updated: Individual) => {
    if (userRole !== 'admin') {
      showToast("Action refusée : En profil lecteur, la modification de données n'est pas autorisée.");
      return;
    }

    const nextData = {
      ...data,
      individuals: { ...data.individuals, [updated.id]: updated },
      rootPersonId: data.rootPersonId || updated.id,
    };
    setData(nextData);
    setVersionedItem(`${STORAGE_KEYS.TREE}_${roomId}`, nextData);
    setVersionedItem(STORAGE_KEYS.TREE, nextData);
    setSelectedPersonId(updated.id);
    recordKnownTree({
      id: roomId,
      title: nextData.sourceHeader || roomId,
      personCount: Object.keys(nextData.individuals).length,
      lastOpenedAt: Date.now(),
    });

    // Broadcast via WebSocket
    realtimeClient.sendAction('person:edit', updated);

    // File d'attente si hors ligne
    if (!isWsConnected && isRelayAvailable) {
      addPendingChange('person:edit', updated);
    }

    // Persist to Firestore if user is authenticated or room is active
    try {
      await saveTreeToFirestore(roomId, nextData, currentUser);
      setIsCloudSynced(true);
    } catch (e) {
      console.warn('Firestore sync fallback', e);
    }

    showToast(`Fiche de ${updated.name} enregistrée.`);
  };

  // Choix du de cujus (Sosa 1) : la numérotation Sosa de toutes les vues en dépend
  const handleSetRootPerson = async (personId: string) => {
    if (userRole !== 'admin' || !data.individuals[personId]) return;
    const nextData = { ...data, rootPersonId: personId };
    setData(nextData);
    setVersionedItem(`${STORAGE_KEYS.TREE}_${roomId}`, nextData);
    setVersionedItem(STORAGE_KEYS.TREE, nextData);
    realtimeClient.sendAction('tree:update', nextData);
    if (!isWsConnected && isRelayAvailable) {
      addPendingChange('tree:update', nextData);
    }
    try {
      await saveTreeToFirestore(roomId, nextData, currentUser);
    } catch (e) {
      console.warn('Firestore sync fallback', e);
    }
    showToast(`${data.individuals[personId].name} est désormais la racine de l'arbre (Sosa 1).`);
  };

  const handleAddArchive = async (newDoc: ArchiveDocument) => {
    if (userRole !== 'admin') {
      showToast("Action refusée : En profil lecteur, l'ajout d'archives n'est pas autorisé.");
      return;
    }

    const nextArchives = [newDoc, ...archives];
    setArchives(nextArchives);
    setVersionedItem(`${STORAGE_KEYS.ARCHIVES}_${roomId}`, nextArchives);
    setVersionedItem(STORAGE_KEYS.ARCHIVES, nextArchives);
    realtimeClient.sendAction('archive:add', newDoc);

    if (!isWsConnected && isRelayAvailable) {
      addPendingChange('archive:add', newDoc);
    }

    try {
      await saveArchiveToFirestore(roomId, newDoc, currentUser);
      setIsCloudSynced(true);
    } catch (e) {
      console.warn('Firestore archive save fallback', e);
    }

    showToast(`Acte archivé : ${newDoc.title}`);
  };

  const handleUpdateArchive = async (updated: ArchiveDocument) => {
    if (userRole !== 'admin') {
      showToast("Action refusée : En profil lecteur, la modification d'archives n'est pas autorisée.");
      return;
    }

    const nextArchives = archives.map(a => a.id === updated.id ? updated : a);
    setArchives(nextArchives);
    setVersionedItem(`${STORAGE_KEYS.ARCHIVES}_${roomId}`, nextArchives);
    setVersionedItem(STORAGE_KEYS.ARCHIVES, nextArchives);
    realtimeClient.sendAction('archive:add', updated);

    if (!isWsConnected && isRelayAvailable) {
      addPendingChange('archive:add', updated);
    }

    try {
      await saveArchiveToFirestore(roomId, updated, currentUser);
      setIsCloudSynced(true);
    } catch (e) {
      console.warn('Firestore archive update fallback', e);
    }

    showToast(`Acte mis à jour : ${updated.title}`);
  };

  const handleDeleteArchive = async (id: string) => {
    if (userRole !== 'admin') {
      showToast("Action refusée : En profil lecteur, la suppression d'archives n'est pas autorisée.");
      return;
    }

    const nextArchives = archives.filter(a => a.id !== id);
    setArchives(nextArchives);
    setVersionedItem(`${STORAGE_KEYS.ARCHIVES}_${roomId}`, nextArchives);
    setVersionedItem(STORAGE_KEYS.ARCHIVES, nextArchives);
    realtimeClient.sendAction('archive:delete', id);

    if (!isWsConnected && isRelayAvailable) {
      addPendingChange('archive:delete', id);
    }
    
    try {
      await deleteArchiveFromFirestore(roomId, id, currentUser);
    } catch (e) {
      console.warn('Firestore delete fallback', e);
    }

    showToast('Acte supprimé du fonds d\'archives.');
  };

  const handleLoadGedcom = async (newData: GenealogyData) => {
    if (userRole !== 'admin') {
      showToast("Action refusée : L'importation GEDCOM est réservée au profil créateur.");
      return;
    }

    // L'import alimente l'arbre courant : il conserve le nom choisi à la création
    // (le parseur renvoie sinon un titre générique du type « GEDCOM File »).
    if (data.sourceHeader) {
      newData = { ...newData, sourceHeader: data.sourceHeader };
    }

    setData(newData);
    setVersionedItem(`${STORAGE_KEYS.TREE}_${roomId}`, newData);
    setVersionedItem(STORAGE_KEYS.TREE, newData);
    recordKnownTree({
      id: roomId,
      title: newData.sourceHeader || roomId,
      personCount: Object.keys(newData.individuals).length,
      lastOpenedAt: Date.now(),
    });
    if (newData.rootPersonId) setSelectedPersonId(newData.rootPersonId);
    realtimeClient.sendAction('tree:update', newData);

    if (!isWsConnected && isRelayAvailable) {
      addPendingChange('tree:update', newData);
    }

    try {
      await saveTreeToFirestore(roomId, newData, currentUser);
      setIsCloudSynced(true);
    } catch (e) {
      console.warn('Firestore sync fallback', e);
    }

    showToast('Nouvel arbre GEDCOM chargé et synchronisé.');
  };

  const handleRestoreBackup = async (payload: { genealogy: GenealogyData; archives: ArchiveDocument[]; accessList: BranchAccess[] }) => {
    if (userRole !== 'admin') {
      showToast("Action refusée : La restauration de sauvegarde est réservée au profil créateur.");
      return;
    }

    setData(payload.genealogy);
    setArchives(payload.archives);
    setAccessList(payload.accessList);

    setVersionedItem(`${STORAGE_KEYS.TREE}_${roomId}`, payload.genealogy);
    setVersionedItem(STORAGE_KEYS.TREE, payload.genealogy);
    setVersionedItem(`${STORAGE_KEYS.ARCHIVES}_${roomId}`, payload.archives);
    setVersionedItem(STORAGE_KEYS.ARCHIVES, payload.archives);
    setVersionedItem(`${STORAGE_KEYS.ACCESS}_${roomId}`, payload.accessList);
    setVersionedItem(STORAGE_KEYS.ACCESS, payload.accessList);

    recordKnownTree({
      id: roomId,
      title: payload.genealogy.sourceHeader || roomId,
      personCount: Object.keys(payload.genealogy.individuals).length,
      lastOpenedAt: Date.now(),
    });

    if (payload.genealogy.rootPersonId) {
      setSelectedPersonId(payload.genealogy.rootPersonId);
    }

    realtimeClient.sendAction('tree:update', payload.genealogy);

    try {
      await saveTreeToFirestore(roomId, payload.genealogy, currentUser);
      setIsCloudSynced(true);
    } catch (e) {}

    showToast('Sauvegarde complète restaurée avec succès.');
  };

  const handleCreateNewPerson = () => {
    if (userRole !== 'admin') {
      showToast("Action refusée : En profil lecteur, l'ajout d'individu est désactivé.");
      return;
    }

    const existingIds = Object.keys(data.individuals);
    let nextNum = 1;
    while (existingIds.includes(`@I${nextNum}@`)) {
      nextNum++;
    }
    const newPerson: Individual = {
      id: `@I${nextNum}@`,
      name: 'Nouveau Membre',
      sex: 'M',
      familiesAsChild: [],
      familiesAsSpouse: [],
      notes: [],
    };
    setEditingPerson(newPerson);
  };

  const handleClearTree = async () => {
    if (userRole !== 'admin') {
      showToast("Action refusée : La réinitialisation est réservée au profil créateur.");
      return;
    }
    const emptyTree = createEmptyGenealogy(data.sourceHeader || roomId);
    const emptyArchives: ArchiveDocument[] = [];
    const emptyAccess: BranchAccess[] = [];

    setData(emptyTree);
    setArchives(emptyArchives);
    setAccessList(emptyAccess);
    setSelectedPersonId('');
    setSelectedArchiveId('');

    const roomTreeKey = `${STORAGE_KEYS.TREE}_${roomId}`;
    const roomArchKey = `${STORAGE_KEYS.ARCHIVES}_${roomId}`;
    const roomAccessKey = `${STORAGE_KEYS.ACCESS}_${roomId}`;

    setVersionedItem(roomTreeKey, emptyTree);
    setVersionedItem(STORAGE_KEYS.TREE, emptyTree);
    setVersionedItem(roomArchKey, emptyArchives);
    setVersionedItem(STORAGE_KEYS.ARCHIVES, emptyArchives);
    setVersionedItem(roomAccessKey, emptyAccess);
    setVersionedItem(STORAGE_KEYS.ACCESS, emptyAccess);
    clearStoredArchives();

    realtimeClient.sendAction('tree:update', emptyTree);

    try {
      await clearTreeFromFirestore(roomId, currentUser);
    } catch (e) {
      console.warn('Erreur Firestore lors de la réinitialisation', e);
    }

    recordKnownTree({
      id: roomId,
      title: emptyTree.sourceHeader || roomId,
      personCount: 0,
      lastOpenedAt: Date.now(),
    });

    showToast('L\'arbre actuel a été réinitialisé. Arbre vierge prêt.');
  };

  // Suppression côté serveur relais (cache mémoire + data/rooms/<id>.json).
  // Le serveur n'héberge un arbre que pour un administrateur authentifié : sans compte, rien à purger.
  const handleDeleteTreeOnServer = async (treeId: string) => {
    if (!currentUser) return;
    try {
      const idToken = await currentUser.getIdToken();
      const tokenRes = await fetch('/api/auth/room-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ roomId: treeId }),
      });
      if (!tokenRes.ok || !isJsonResponse(tokenRes)) return;
      const { token, role } = await tokenRes.json();
      if (!token || role !== 'admin') return;
      const delRes = await fetch(`/api/rooms/${encodeURIComponent(treeId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!delRes.ok) {
        console.warn('Suppression serveur refusée :', await delRes.text());
      }
    } catch (e) {
      console.warn('Suppression serveur impossible :', e);
    }
  };

  // Plus aucun arbre après une suppression : on repart sur l'assistant de création
  const handleNoTreeLeft = () => {
    const emptyTree = createEmptyGenealogy('');
    setData(emptyTree);
    setArchives([]);
    setAccessList([]);
    setSelectedPersonId('');
    setSelectedArchiveId('');
    setUserRole('admin');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.pushState({}, '', url.toString());
    }
    setIsTreeManagerOpen(false);
    setIsFirstTreeWizardOpen(true);
    showToast('Arbre supprimé. Créez un nouvel arbre pour continuer.');
  };

  // Publie (ou republie) l'instantané chiffré d'un lien ; ne réécrit pas si le contenu n'a pas changé
  const publishShare = async (access: BranchAccess, force = false): Promise<void> => {
    if (!currentUser || !access.shareKey) return;
    const snapshot = buildShareSnapshot(data, archives, access, changeLog);
    const fingerprint = await snapshotFingerprint(snapshot);
    const fpKey = `genealogor_share_fp_${access.shareToken}`;
    try {
      if (!force && localStorage.getItem(fpKey) === fingerprint) return;
    } catch (e) {}
    const shareDoc: ShareDocument = {
      version: SHARE_FORMAT_VERSION,
      treeId: roomId,
      ownerId: currentUser.uid,
      hasPassword: Boolean(access.wrappedKey),
      ...(access.wrappedKey ? { wrappedKey: access.wrappedKey } : {}),
      payload: await sealSnapshot(snapshot, access.shareKey),
      updatedAt: new Date().toISOString(),
    };
    await publishShareToFirestore(access.shareToken, shareDoc, currentUser);
    try {
      localStorage.setItem(fpKey, fingerprint);
    } catch (e) {}
  };

  const handleAddAccessRule = async (newAcc: BranchAccess) => {
    if (newAcc.shareKey) {
      try {
        await publishShare(newAcc, true);
      } catch (e: any) {
        console.warn('Publication du lien de partage impossible :', e);
        throw new Error(
          'Publication refusée par Firestore. Vérifiez que vous êtes connecté avec Google et que les règles Firestore (collection « shares ») ont été déployées.'
        );
      }
    }
    const next = [newAcc, ...accessList];
    setAccessList(next);
    setVersionedItem(`${STORAGE_KEYS.ACCESS}_${roomId}`, next);
    setVersionedItem(STORAGE_KEYS.ACCESS, next);
    try {
      await saveAccessToFirestore(roomId, newAcc, currentUser);
    } catch (e) {}
    realtimeClient.sendAction('access:update', stripShareSecrets(next));
    showToast(`Lien pour ${newAcc.name} créé.`);
  };

  // Liens de partage : republier les instantanés quand l'arbre ou les archives changent (après 3 s de calme)
  useEffect(() => {
    if (isSharedView || userRole !== 'admin' || !currentUser) return;
    const shares = accessList.filter(isFirestoreShare);
    if (shares.length === 0) return;
    const timer = setTimeout(() => {
      for (const access of shares) {
        publishShare(access).catch(e => console.warn(`Mise à jour du lien « ${access.name} » impossible :`, e));
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [data, archives, accessList, currentUser, userRole, changeLog]);

  // Vue partagée : lecture publique de l'instantané, mises à jour en direct
  const [sharedView, setSharedView] = useState<SharedViewState>({ status: 'loading' });
  const sharedKeyRef = React.useRef<string>(SHARE_PARAMS?.key || '');

  const applySharedSnapshot = async (shareDoc: ShareDocument, key: string) => {
    const snapshot = await openSnapshot(shareDoc.payload, key);
    const tree = { ...snapshot.tree, sourceHeader: snapshot.title };
    setData(tree);
    setArchives(snapshot.archives);
    setAccessList([]);
    const changes = snapshot.changes || [];
    setChangeLog(changes);
    // Première ouverture du lien : l'historique antérieur n'est pas signalé comme nouveau
    setAlertState(prev => {
      if (prev) return prev;
      const initial = loadAlertState(alertScope) || allReadState(changes, null);
      saveAlertState(alertScope, initial);
      return initial;
    });
    setUserRole('viewer');
    setCurrentBranchScope('all');
    setSelectedPersonId(prev => (prev && tree.individuals[prev]) ? prev : (tree.rootPersonId || Object.keys(tree.individuals)[0] || ''));
    setSharedView({ status: 'ready', title: snapshot.title, shareName: snapshot.shareName, generatedAt: snapshot.generatedAt });
  };

  useEffect(() => {
    if (!SHARE_PARAMS) return;
    return subscribeToShare(
      SHARE_PARAMS.token,
      async (shareDoc) => {
        if (!shareDoc) {
          setSharedView({ status: 'missing' });
          return;
        }
        if (!sharedKeyRef.current) {
          setSharedView(shareDoc.hasPassword && shareDoc.wrappedKey
            ? { status: 'locked', doc: shareDoc }
            : { status: 'no-key' });
          return;
        }
        try {
          await applySharedSnapshot(shareDoc, sharedKeyRef.current);
        } catch (e) {
          setSharedView({ status: 'error', message: 'La clé du lien ne permet pas de déchiffrer cet arbre (lien incomplet ou modifié).' });
        }
      },
      () => setSharedView({ status: 'missing' })
    );
  }, []);

  const handleUnlockShare = async (password: string): Promise<boolean> => {
    if (sharedView.status !== 'locked' || !sharedView.doc.wrappedKey) return false;
    try {
      const key = await unwrapShareKey(sharedView.doc.wrappedKey, password);
      await applySharedSnapshot(sharedView.doc, key);
      sharedKeyRef.current = key;
      return true;
    } catch (e) {
      return false;
    }
  };

  // Lien de partage : écrans de chargement, mot de passe ou erreur avant l'affichage de l'arbre
  if (isSharedView) {
    if (sharedView.status === 'locked') {
      return (
        <PassphraseScreen
          branchName="Arbre partagé protégé"
          onUnlock={handleUnlockShare}
        />
      );
    }
    if (sharedView.status !== 'ready') {
      return <SharedLinkStatus status={sharedView.status} message={'message' in sharedView ? sharedView.message : undefined} />;
    }
  }

  // If private link is protected and locked, show passphrase screen
  if (!isUnlocked && pendingBranchAccess) {
    return (
      <PassphraseScreen
        branchName={pendingBranchAccess.name}
        onUnlock={handleUnlockWithPassword}
        onContinueAsGuest={() => {
          setIsUnlocked(true);
          setCurrentBranchScope('paternal');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF9F5] dark:bg-[#121418] text-stone-900 dark:text-stone-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* Barre de navigation et alertes, épinglées ensemble en haut de l'écran */}
      <div className="sticky top-0 z-40">
        <Navbar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onOpenShareModal={() => setIsShareModalOpen(true)}
          onOpenExportModal={() => setIsExportModalOpen(true)}
          onOpenHamburgerMenu={() => setIsHamburgerOpen(true)}
          onOpenSystemSettings={() => setIsSystemSettingsOpen(true)}
          onOpenTreeManager={() => setIsTreeManagerOpen(true)}
          themeMode={themeMode}
          onToggleTheme={handleToggleTheme}
          currentAccess={accessList.find(a => a.branch === currentBranchScope)}
          userRole={userRole}
          connectedPeerCount={connectedPeerCount}
          isWsConnected={isWsConnected}
          treeTitle={data.sourceHeader || roomId || 'Mon Arbre'}
          currentUser={currentUser}
          onLogin={handleLogin}
          onLogout={handleLogout}
          isCloudSynced={isCloudSynced}
        />

        {/* Alertes : modifications de l'arbre non encore vues, cliquables */}
        <ChangeAlertBanner
          unread={unreadChanges}
          data={effectiveData}
          archives={effectiveArchives}
          onOpen={handleOpenChange}
          onMarkAllRead={handleMarkAllChangesRead}
        />
      </div>

      {/* Anomalies alert bar if any detected */}
      {anomalies.length > 0 && activeTab === 'tree' && (
        <div className="bg-amber-50 border-b border-amber-200/80 px-4 md:px-8 py-2 text-xs text-amber-900 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0" />
            <span>
              <strong>Contrôle de cohérence :</strong> {anomalies.length} anomalie(s) chronologique(s) détectée(s) (ex : {anomalies[0].message}).
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                setSelectedPersonId(anomalies[0].personId);
                setActiveTab('profile');
              }}
              className="font-bold underline hover:text-amber-950 cursor-pointer"
            >
              Ouvrir la fiche →
            </button>
            {anomalies.length > 1 && (
              <button
                onClick={() => setActiveTab('stats')}
                className="underline hover:text-amber-950 cursor-pointer"
              >
                Voir toutes les anomalies
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bandeau de consultation d'un lien partagé */}
      {sharedView.status === 'ready' && (
        <div className="bg-sky-50 dark:bg-sky-950/40 border-b border-sky-200/80 dark:border-sky-900 px-4 md:px-8 py-2 text-xs text-sky-950 dark:text-sky-200 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>Arbre partagé en consultation</strong> · {sharedView.shareName} · lecture seule
          </span>
          <span className="font-mono text-[11px] text-sky-800 dark:text-sky-300">
            Mis à jour le {new Date(sharedView.generatedAt).toLocaleString('fr-FR')}
          </span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* Guide d'onboarding contextuel dynamique par écran */}
        <ContextualGuide screen={activeTab} />

        {activeTab === 'tree' && (
          <TreeView
            data={effectiveData}
            selectedPersonId={selectedPersonId}
            onSelectPerson={setSelectedPersonId}
            onViewProfile={(id) => {
              setSelectedPersonId(id);
              setActiveTab('profile');
            }}
            onViewArchives={(id) => {
              setSelectedPersonId(id);
              setActiveTab('archives');
            }}
            archiveCountByPerson={archiveCountByPerson}
            onAddNewPerson={userRole === 'admin' ? handleCreateNewPerson : undefined}
            onOpenImportModal={userRole === 'admin' ? () => setIsExportModalOpen(true) : undefined}
            onOpenTreeManager={userRole === 'admin' ? () => setIsTreeManagerOpen(true) : undefined}
            onSetRootPerson={userRole === 'admin' ? handleSetRootPerson : undefined}
            treeTitle={data.sourceHeader || roomId}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            personId={selectedPersonId}
            data={effectiveData}
            archives={effectiveArchives}
            onSelectPerson={setSelectedPersonId}
            onEditPerson={userRole === 'admin' ? (p) => setEditingPerson(p) : undefined}
            onOpenArchives={() => setActiveTab('archives')}
            onSelectArchive={(docId) => {
              setSelectedArchiveId(docId);
              setActiveTab('archives');
            }}
            onAddNewPerson={userRole === 'admin' ? handleCreateNewPerson : undefined}
            onOpenImportModal={() => setIsExportModalOpen(true)}
            onOpenDeptDirectory={() => setIsDeptDirectoryOpen(true)}
          />
        )}

        {activeTab === 'ancestors' && (
          <FanChartView
            rootPerson={effectiveData.individuals[selectedPersonId] || Object.values(effectiveData.individuals)[0]}
            individuals={effectiveData.individuals}
            families={effectiveData.families}
            onSelectPerson={(id) => {
              setSelectedPersonId(id);
              setActiveTab('profile');
            }}
          />
        )}

        {activeTab === 'descendants' && (
          <DescendantsView
            rootPerson={effectiveData.individuals[selectedPersonId] || Object.values(effectiveData.individuals)[0]}
            individuals={effectiveData.individuals}
            families={effectiveData.families}
            onSelectPerson={(id) => {
              setSelectedPersonId(id);
              setActiveTab('profile');
            }}
          />
        )}

        {activeTab === 'implex' && (
          <ImplexView
            rootPerson={effectiveData.individuals[selectedPersonId] || Object.values(effectiveData.individuals)[0]}
            individuals={effectiveData.individuals}
            families={effectiveData.families}
            onSelectPerson={(id) => {
              setSelectedPersonId(id);
              setActiveTab('profile');
            }}
          />
        )}

        {activeTab === 'validation' && (
          <ValidationView
            individuals={effectiveData.individuals}
            families={effectiveData.families}
            onSelectPerson={(id) => {
              setSelectedPersonId(id);
              setActiveTab('profile');
            }}
          />
        )}

        {activeTab === 'compare' && (
          <CompareView
            person={effectiveData.individuals[selectedPersonId] || Object.values(effectiveData.individuals)[0]}
            individuals={effectiveData.individuals}
            families={effectiveData.families}
            onSelectPerson={(id) => {
              setSelectedPersonId(id);
              setActiveTab('profile');
            }}
          />
        )}

        {activeTab === 'graph' && (
          <ForceGraphView
            individuals={effectiveData.individuals}
            families={effectiveData.families}
            selectedPersonId={selectedPersonId}
            onSelectPerson={(id) => {
              setSelectedPersonId(id);
              setActiveTab('profile');
            }}
          />
        )}

        {activeTab === 'archives' && (
          <ArchivesView
            key={archiveFocusNonce}
            archives={effectiveArchives}
            data={effectiveData}
            selectedArchiveId={selectedArchiveId}
            onAddArchive={userRole === 'admin' ? handleAddArchive : undefined}
            onUpdateArchive={userRole === 'admin' ? handleUpdateArchive : undefined}
            onDeleteArchive={userRole === 'admin' ? handleDeleteArchive : undefined}
            onSelectPerson={(pId) => {
              setSelectedPersonId(pId);
              setActiveTab('profile');
            }}
          />
        )}

        {activeTab === 'timeline' && (
          <TimelineView
            data={effectiveData}
            onSelectPerson={(id) => {
              setSelectedPersonId(id);
              setActiveTab('profile');
            }}
          />
        )}

        {activeTab === 'map' && (
          <GeoMapView
            data={effectiveData}
            onSelectPerson={(id) => {
              setSelectedPersonId(id);
              setActiveTab('profile');
            }}
          />
        )}

        {activeTab === 'stats' && (
          <StatsView
            data={effectiveData}
            archiveCount={archives.length}
            onSelectPerson={(id) => {
              setSelectedPersonId(id);
              setActiveTab('profile');
            }}
          />
        )}
      </main>

      {/* Floating utility quick actions button for GEDCOM & Duplicates */}
      <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2">
        {userRole === 'admin' && (
          <button
            onClick={() => setIsMergeModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-800 bg-white/95 border border-stone-300 shadow-md hover:bg-stone-50 transition-all backdrop-blur-xs cursor-pointer"
          >
            <GitMerge className="w-3.5 h-3.5 text-amber-800" />
            <span>Fusionner les doublons</span>
          </button>
        )}

        <button
          onClick={() => setIsExportModalOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-800 bg-white/95 border border-stone-300 shadow-md hover:bg-stone-50 transition-all backdrop-blur-xs cursor-pointer"
        >
          <Database className="w-3.5 h-3.5 text-amber-800" />
          <span>Fichiers & Sauvegardes</span>
        </button>
      </div>

      {/* Floating realtime toast */}
      {toastMessage && (
        <div className="fixed bottom-4 left-4 z-50 bg-stone-900 text-white px-4 py-2.5 rounded-xl text-xs font-medium shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Share & Branch Permissions Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        data={data}
        roomId={roomId}
        accessList={accessList}
        userRole={userRole}
        onAddAccess={handleAddAccessRule}
        isCloudReady={!!currentUser}
        onLogin={handleLogin}
        onDeleteAccess={async (id) => {
          const removed = accessList.find(a => a.id === id);
          const next = accessList.filter(a => a.id !== id);
          setAccessList(next);
          setVersionedItem(`${STORAGE_KEYS.ACCESS}_${roomId}`, next);
          setVersionedItem(STORAGE_KEYS.ACCESS, next);
          try {
            await deleteAccessFromFirestore(roomId, id, currentUser);
          } catch (e) {}
          if (removed?.shareKey) {
            try {
              await deleteShareFromFirestore(removed.shareToken, currentUser);
              localStorage.removeItem(`genealogor_share_fp_${removed.shareToken}`);
            } catch (e) {
              console.warn('Suppression de l\'instantané partagé impossible :', e);
            }
          }
          realtimeClient.sendAction('access:update', stripShareSecrets(next));
          showToast('Lien d\'accès révoqué et supprimé.');
        }}
        rootPersonId={data.rootPersonId || Object.keys(data.individuals)[0]}
      />

      {/* Export / Import GEDCOM & Backup Modal */}
      <ExportImportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        data={userRole === 'admin' ? data : effectiveData}
        archives={userRole === 'admin' ? archives : effectiveArchives}
        accessList={accessList}
        userRole={userRole}
        onLoadGedcom={handleLoadGedcom}
        onRestoreBackup={handleRestoreBackup}
        onClearTree={handleClearTree}
      />

      {/* Merge Duplicates Modal */}
      <MergeModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        data={data}
        onMergeComplete={(newData) => {
          setData(newData);
          setVersionedItem(`${STORAGE_KEYS.TREE}_${roomId}`, newData);
          setVersionedItem(STORAGE_KEYS.TREE, newData);
          realtimeClient.sendAction('tree:update', newData);
          try {
            saveTreeToFirestore(roomId, newData, currentUser);
          } catch (e) {}
          showToast('Doublons fusionnés avec succès sans perte de données.');
        }}
      />

      {/* Edit Person Modal */}
      <EditPersonModal
        person={editingPerson}
        isOpen={!!editingPerson}
        onClose={() => setEditingPerson(null)}
        onSave={handleUpdatePerson}
      />

      {/* Auth Error Diagnostic Modal */}
      {authError && (
        <AuthErrorModal
          errorInfo={authError}
          onClose={() => setAuthError(null)}
          onSuccess={() => {
            setAuthError(null);
            showToast('Connexion Google réussie !');
          }}
        />
      )}

      {/* Hamburger Drawer Menu */}
      <HamburgerMenu
        isOpen={isHamburgerOpen}
        onClose={() => setIsHamburgerOpen(false)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenSystemSettings={() => setIsSystemSettingsOpen(true)}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenTreeManager={() => setIsTreeManagerOpen(true)}
        onOpenDeptDirectory={() => setIsDeptDirectoryOpen(true)}
        currentRoomId={roomId}
        currentTreeTitle={data.sourceHeader || roomId || 'Mon Arbre'}
        personCount={Object.keys(data.individuals).length}
        themeMode={themeMode}
        onToggleTheme={handleToggleTheme}
        isCloudSynced={isCloudSynced}
        isWsConnected={isWsConnected}
        userRole={userRole}
      />

      {/* Directory of 97 French Departmental Archives Modal */}
      <DepartmentDirectoryModal
        isOpen={isDeptDirectoryOpen}
        onClose={() => setIsDeptDirectoryOpen(false)}
      />

      {/* Tree Manager Modal (Créer / Changer d'Arbre) */}
      <TreeManagerModal
        isOpen={isTreeManagerOpen}
        onClose={() => setIsTreeManagerOpen(false)}
        currentRoomId={roomId}
        currentTreeTitle={data.sourceHeader || roomId || 'Mon Arbre'}
        currentPersonCount={Object.keys(data.individuals).length}
        currentArchiveCount={archives.length}
        currentUser={currentUser}
        userRole={userRole}
        onSwitchTree={handleSwitchTree}
        onDeleteTree={async (treeId) => {
          await handleDeleteTreeOnServer(treeId);
          showToast('Arbre supprimé définitivement.');
        }}
        onNoTreeLeft={handleNoTreeLeft}
        onOpenGedcomImport={(treeId) => {
          const targetId = treeId || roomId;
          const known = getKnownTrees().find(t => t.id === targetId);
          setGedcomTargetTree({
            id: targetId,
            title: known?.title || targetId,
            personCount: known?.personCount,
          });
        }}
      />

      {/* Assistant de premier arbre : 1. Création de l'arbre → 2. Import du fichier .GED */}
      <FirstTimeTreeWizard
        isOpen={(isFirstTreeWizardOpen || !!gedcomTargetTree) && !isOnboardingOpen}
        existingTree={isFirstTreeWizardOpen ? null : gedcomTargetTree}
        dismissable={!!gedcomTargetTree || getKnownTrees().length > 0}
        onClose={() => {
          setIsFirstTreeWizardOpen(false);
          setGedcomTargetTree(null);
          // Fermeture après « Supprimer et recommencer » : ne pas rester sur un arbre supprimé
          const remaining = getKnownTrees();
          if (!remaining.some(t => t.id === roomId)) {
            if (remaining.length > 0) {
              handleSwitchTree(remaining[0].id, remaining[0].title);
            } else {
              handleNoTreeLeft();
            }
          }
        }}
        onTreeDeleted={async (treeId) => {
          await handleDeleteTreeOnServer(treeId);
          if (treeId === roomId) {
            setData(createEmptyGenealogy(''));
            setArchives([]);
            setAccessList([]);
            setSelectedPersonId('');
          }
          // L'étape 1 recrée un arbre : l'assistant n'est plus lié à l'arbre supprimé
          setGedcomTargetTree(null);
          setIsFirstTreeWizardOpen(true);
        }}
        onTreeCreatedAndLoaded={(treeId, title, treeData) => {
          handleSwitchTree(treeId, title, { ...treeData, sourceHeader: title });
        }}
      />

      {/* System Settings & Updates Modal */}
      <SystemSettingsModal
        isOpen={isSystemSettingsOpen}
        onClose={() => setIsSystemSettingsOpen(false)}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        isWsConnected={isWsConnected}
        isCloudSynced={isCloudSynced}
      />

      {/* Legal Disclaimer & Welcome Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        isDismissable={hasAcceptedOnboarding()}
      />

      {/* Footer */}
      <footer className="border-t border-stone-200/80 dark:border-stone-800 bg-stone-100/60 dark:bg-[#0D0F12] py-4 px-6 text-center text-xs text-stone-500 dark:text-stone-400 font-mono transition-colors">
        <span>Genealogor · Recherche historique, archives numérisées, synchronisation Firestore et collaboration familiale</span>
      </footer>

    </div>
  );
}
