import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, FolderTree, Plus, Search, Check, RefreshCw, Cloud, HardDrive, 
  Trash2, ArrowRight, Sparkles, AlertCircle, Info, ExternalLink, GitFork, Users,
  Upload, FileText, AlertTriangle
} from 'lucide-react';
import { User } from 'firebase/auth';
import { 
  KnownTree, 
  getKnownTrees, 
  recordKnownTree, 
  removeKnownTreeFromLocal, 
  slugifyTreeId, 
  isValidTreeId,
  markTreeCreatedLocally,
  isTreeCreatedLocally,
  deleteTreeCompletely
} from '../lib/tree-manager';
import { listUserTreesFromFirestore, TreeFirestoreSummary } from '../lib/firestore-sync';
import { InfoTooltip } from './InfoTooltip';
import { createEmptyGenealogy } from '../lib/sample-data';
import { GenealogyData, BranchRole } from '../types/genealogy';
import { Shield, Lock } from 'lucide-react';

interface TreeManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRoomId: string;
  currentTreeTitle: string;
  currentPersonCount: number;
  currentArchiveCount: number;
  currentUser: User | null;
  userRole?: BranchRole;
  onSwitchTree: (treeId: string, title?: string, templateData?: GenealogyData) => void;
  onDeleteTree?: (treeId: string) => Promise<void>;
  /** Appelé quand l'arbre actif a été supprimé et qu'il ne reste plus aucun arbre */
  onNoTreeLeft?: () => void;
  onOpenGedcomImport?: (treeId?: string) => void;
}

export const TreeManagerModal: React.FC<TreeManagerModalProps> = ({
  isOpen,
  onClose,
  currentRoomId,
  currentTreeTitle,
  currentPersonCount,
  currentArchiveCount,
  currentUser,
  userRole = 'viewer',
  onSwitchTree,
  onDeleteTree,
  onNoTreeLeft,
  onOpenGedcomImport,
}) => {
  const [activeTab, setActiveTab] = useState<'switch' | 'create'>('switch');
  const [searchTerm, setSearchTerm] = useState('');
  const [knownTrees, setKnownTrees] = useState<KnownTree[]>([]);
  const [firestoreTrees, setFirestoreTrees] = useState<TreeFirestoreSummary[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Formulaire de création
  const [newTitle, setNewTitle] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createActionOption, setCreateActionOption] = useState<'empty' | 'gedcom'>('gedcom');

  // État de suppression sécurisée d'un arbre
  const [treeToDelete, setTreeToDelete] = useState<KnownTree | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const openDeleteDialog = (tree: KnownTree) => {
    setTreeToDelete(tree);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  // Charger les arbres connus et Firestore à l'ouverture
  useEffect(() => {
    if (!isOpen) return;
    const local = getKnownTrees();
    setKnownTrees(local);

    // Enregistrer l'arbre courant s'il n'est pas encore consigné
    if (currentRoomId) {
      recordKnownTree({
        id: currentRoomId,
        title: currentTreeTitle || currentRoomId,
        personCount: currentPersonCount,
        lastOpenedAt: Date.now(),
      });
    }

    if (currentUser) {
      loadFirestoreTrees();
    }
  }, [isOpen, currentRoomId, currentTreeTitle, currentPersonCount, currentUser]);

  const loadFirestoreTrees = async () => {
    if (!currentUser) return;
    setIsLoadingCloud(true);
    setCloudError(null);
    try {
      const list = await listUserTreesFromFirestore(currentUser);
      setFirestoreTrees(list);

      // Fusionner les arbres Firestore dans les arbres connus locaux
      for (const ft of list) {
        recordKnownTree({
          id: ft.id,
          title: ft.title,
          personCount: ft.personCount,
          ownerEmail: ft.ownerEmail,
          lastOpenedAt: ft.updatedAt ? new Date(ft.updatedAt).getTime() : Date.now(),
        });
      }
      setKnownTrees(getKnownTrees());
    } catch (e: any) {
      setCloudError('Impossible de récupérer la liste des arbres Firestore.');
    } finally {
      setIsLoadingCloud(false);
    }
  };

  // Synchroniser le slug avec le titre lors de la frappe
  const handleTitleChange = (val: string) => {
    setNewTitle(val);
    if (!isSlugManuallyEdited) {
      setNewSlug(slugifyTreeId(val));
    }
    setFormError(null);
  };

  const handleSlugChange = (val: string) => {
    setIsSlugManuallyEdited(true);
    setNewSlug(slugifyTreeId(val));
    setFormError(null);
  };

  // Liste fusionnée dédoublonnée
  const allTrees = useMemo(() => {
    const map = new Map<string, KnownTree>();

    for (const tree of knownTrees) {
      map.set(tree.id, tree);
    }

    for (const ft of firestoreTrees) {
      const existing = map.get(ft.id);
      map.set(ft.id, {
        id: ft.id,
        title: ft.title,
        personCount: ft.personCount ?? existing?.personCount,
        ownerEmail: ft.ownerEmail,
        lastOpenedAt: existing?.lastOpenedAt || Date.now(),
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      // Arbre actuel en premier, puis par date d'ouverture
      if (a.id === currentRoomId) return -1;
      if (b.id === currentRoomId) return 1;
      return b.lastOpenedAt - a.lastOpenedAt;
    });
  }, [knownTrees, firestoreTrees, currentRoomId]);

  // Filtrage par recherche
  const filteredTrees = useMemo(() => {
    if (!searchTerm.trim()) return allTrees;
    const q = searchTerm.toLowerCase();
    return allTrees.filter(t => 
      t.title.toLowerCase().includes(q) || 
      t.id.toLowerCase().includes(q)
    );
  }, [allTrees, searchTerm]);

  // Action : Basculer sur un arbre
  const handleSelectTree = (treeId: string, title?: string) => {
    if (treeId === currentRoomId) {
      onClose();
      return;
    }
    recordKnownTree({ id: treeId, title: title || treeId, lastOpenedAt: Date.now() });
    onSwitchTree(treeId, title);
    onClose();
  };

  // Action : Supprimer définitivement un arbre (données locales, archives et cloud)
  const handleConfirmDeleteTree = async () => {
    if (!treeToDelete) return;
    setIsDeleting(true);
    try {
      const deletedId = treeToDelete.id;
      const res = await deleteTreeCompletely(deletedId, currentUser);
      if (!res.success) {
        setDeleteError('La suppression a échoué. Réessayez ou rechargez l\'application.');
        return;
      }

      if (onDeleteTree) {
        await onDeleteTree(deletedId);
      }

      setKnownTrees(prev => prev.filter(t => t.id !== deletedId));
      setFirestoreTrees(prev => prev.filter(t => t.id !== deletedId));

      // Si on supprime l'arbre actuellement ouvert
      if (deletedId === currentRoomId) {
        if (res.nextTreeId) {
          onSwitchTree(res.nextTreeId);
        } else if (onNoTreeLeft) {
          // Aucun autre arbre : retour à l'assistant de création
          onNoTreeLeft();
        } else {
          // Aucun autre arbre : réinitialiser un arbre vierge propre
          const fallbackTitle = 'Mon Arbre';
          const fallbackSlug = 'mon-arbre';
          markTreeCreatedLocally(fallbackSlug);
          recordKnownTree({ id: fallbackSlug, title: fallbackTitle, personCount: 0, isCreator: true });
          onSwitchTree(fallbackSlug, fallbackTitle, createEmptyGenealogy(fallbackTitle));
        }
      }

      setTreeToDelete(null);
    } catch (err) {
      console.error('Erreur lors de la suppression de l\'arbre :', err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Action : Supprimer de l'historique local
  const handleDeleteLocal = (e: React.MouseEvent, treeId: string) => {
    e.stopPropagation();
    const updated = removeKnownTreeFromLocal(treeId);
    setKnownTrees(updated);
  };

  // Action : Création d'un nouvel arbre
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // RÈGLE STRICTE : En aucun cas le profil lecteur ne peut créer d'arbre
    if (userRole !== 'admin') {
      setFormError('Action interdite : En aucun cas le profil lecteur ne peut créer un arbre généalogique.');
      return;
    }

    const cleanId = slugifyTreeId(newSlug || newTitle);
    
    if (!isValidTreeId(cleanId)) {
      setFormError('L\'identifiant doit comporter entre 3 et 64 caractères alphanumériques ou tirets (a-z, 0-9, -).');
      return;
    }

    if (allTrees.some(t => t.id === cleanId)) {
      setFormError(`L'identifiant « ${cleanId} » est déjà utilisé par un de vos arbres. Choisissez-en un autre.`);
      return;
    }

    const title = newTitle.trim() || `Arbre ${cleanId}`;
    const initialData = createEmptyGenealogy(title);
    initialData.sourceHeader = title;

    // Enregistrer localement la paternité de l'arbre
    markTreeCreatedLocally(cleanId);

    recordKnownTree({
      id: cleanId,
      title,
      personCount: 0,
      isCreator: true,
      lastOpenedAt: Date.now(),
    });

    onSwitchTree(cleanId, title, initialData);
    onClose();

    // Si l'utilisateur a choisi d'importer directement un GEDCOM après création
    if (createActionOption === 'gedcom' && onOpenGedcomImport) {
      setTimeout(() => {
        onOpenGedcomImport(cleanId);
      }, 100);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="tree-manager-title"
        className="bg-[#FBF9F5] dark:bg-[#1A1D24] border border-stone-300 dark:border-stone-700 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100 transition-colors"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200/80 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h2 id="tree-manager-title" className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                Gestionnaire d'Arbres Généalogiques
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Basculez entre vos différentes familles ou créez un nouvel arbre indépendant.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 rounded-lg hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Encadré Arbre Actif */}
        <div className="px-6 pt-4 pb-2">
          <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                  Arbre Actif
                </span>
                <span className="font-serif font-bold text-base text-stone-900 dark:text-stone-100 truncate">
                  {currentTreeTitle || currentRoomId || 'Mon Arbre'}
                </span>
                {userRole === 'admin' ? (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800">
                    👑 Profil Créateur
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/70 text-sky-900 dark:text-sky-300 border border-sky-300/80 dark:border-sky-800">
                    👁️ Profil Lecteur
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-stone-600 dark:text-stone-300 font-mono">
                <span>Salon : <strong>{currentRoomId}</strong></span>
                <span>•</span>
                <span>{currentPersonCount} individu(s)</span>
                <span>•</span>
                <span>{currentArchiveCount} acte(s)</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md">
                <Check className="w-3 h-3" /> Connecté
              </span>

              {userRole === 'admin' && (
                <button
                  type="button"
                  onClick={() => openDeleteDialog({ id: currentRoomId, title: currentTreeTitle || currentRoomId, lastOpenedAt: Date.now() })}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-900 dark:text-rose-400 dark:hover:text-rose-200 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-lg transition-colors cursor-pointer"
                  title="Supprimer cet arbre (si vous vous êtes trompé de fichier ou si l'import s'est mal passé)"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer cet arbre</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bannière d'avertissement Profil Lecteur */}
        {userRole !== 'admin' && (
          <div className="px-6 pt-1 pb-1">
            <div className="p-3 bg-sky-50 dark:bg-sky-950/40 border border-sky-200/90 dark:border-sky-900/50 rounded-xl flex items-start gap-2.5 text-xs text-sky-950 dark:text-sky-200">
              <Shield className="w-4 h-4 shrink-0 text-sky-700 dark:text-sky-400 mt-0.5" />
              <div>
                <span className="font-bold block">Profil Lecteur (Consultation seule)</span>
                <span className="text-[11px] text-sky-900 dark:text-sky-300 leading-relaxed block mt-0.5">
                  Vous consultez cet arbre en tant que lecteur. <strong>En aucun cas le profil lecteur ne peut créer un arbre généalogique.</strong> La création et la gestion sont réservées au créateur de l'arbre.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Onglets Navigation Modale */}
        <div className="px-6 pt-2 flex border-b border-stone-200 dark:border-stone-800">
          <button
            type="button"
            onClick={() => setActiveTab('switch')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'switch'
                ? 'border-amber-900 dark:border-amber-400 text-amber-900 dark:text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Mes Arbres ({allTrees.length})</span>
          </button>

          {userRole === 'admin' ? (
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`pb-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'create'
                  ? 'border-amber-900 dark:border-amber-400 text-amber-900 dark:text-amber-400'
                  : 'border-transparent text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Créer un Nouvel Arbre</span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              title="En aucun cas le profil lecteur ne peut créer d'arbre"
              className="pb-3 px-4 text-xs font-semibold border-b-2 border-transparent text-stone-400 dark:text-stone-600 flex items-center gap-1.5 cursor-not-allowed opacity-60"
            >
              <Lock className="w-3.5 h-3.5 text-stone-400" />
              <span>Créer un Nouvel Arbre (Créateur uniquement)</span>
            </button>
          )}
        </div>

        {/* Corps de la Modale */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {/* ONGLET 1 : CHANGER D'ARBRE / LISTE */}
          {activeTab === 'switch' && (
            <div className="space-y-4">
              
              {/* Barre d'outils liste : Recherche + Actualiser Cloud */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Filtrer par nom ou identifiant de salon..."
                    className="w-full text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg pl-8 pr-3 py-2 text-stone-800 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                </div>

                {currentUser && (
                  <button
                    type="button"
                    onClick={loadFirestoreTrees}
                    disabled={isLoadingCloud}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 dark:text-stone-300 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 rounded-lg border border-stone-300 dark:border-stone-700 transition-colors cursor-pointer"
                    title="Actualiser depuis Google Cloud Firestore"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCloud ? 'animate-spin text-amber-600' : ''}`} />
                    <span>Actualiser Cloud</span>
                  </button>
                )}
              </div>

              {cloudError && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{cloudError}</span>
                </div>
              )}

              {/* Liste des cartes d'arbres */}
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {filteredTrees.map(tree => {
                  const isCurrent = tree.id === currentRoomId;

                  return (
                    <div
                      key={tree.id}
                      onClick={() => handleSelectTree(tree.id, tree.title)}
                      className={`group p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 ring-1 ring-amber-500/40 shadow-xs'
                          : 'bg-white dark:bg-stone-900/60 border-stone-200 dark:border-stone-800 hover:border-amber-300 dark:hover:border-amber-700/60 hover:bg-amber-50/30 dark:hover:bg-stone-800/60'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100 group-hover:text-amber-900 dark:group-hover:text-amber-300 transition-colors">
                            {tree.title}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 font-bold">
                              Actif
                            </span>
                          )}
                          {tree.isCreator || isTreeCreatedLocally(tree.id) ? (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800">
                              👑 Créateur
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200 dark:border-stone-700">
                              👁️ Lecteur
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-stone-400 font-mono">
                          <span className="text-[11px] bg-stone-100 dark:bg-stone-800/80 px-1.5 py-0.5 rounded">
                            salon: {tree.id}
                          </span>
                          {tree.personCount !== undefined && (
                            <span>{tree.personCount} personne(s)</span>
                          )}
                          {tree.ownerEmail && (
                            <span className="truncate max-w-[140px]" title={tree.ownerEmail}>
                              {tree.ownerEmail}
                            </span>
                          )}
                        </div>

                        {tree.description && (
                          <p className="text-xs text-stone-600 dark:text-stone-400 italic truncate">
                            {tree.description}
                          </p>
                        )}
                      </div>

                      {/* Boutons d'action droit */}
                      <div className="flex items-center gap-2 shrink-0">
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => handleSelectTree(tree.id, tree.title)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-900 hover:bg-amber-950 dark:bg-amber-800 dark:hover:bg-amber-700 text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <span>Ouvrir</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {onOpenGedcomImport && userRole === 'admin' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectTree(tree.id, tree.title);
                              onOpenGedcomImport(tree.id);
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-300 hover:text-amber-900 hover:bg-amber-100/60 dark:hover:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700 transition-colors flex items-center gap-1 cursor-pointer"
                            title="Importer un fichier GEDCOM (.ged) dans cet arbre"
                          >
                            <Upload className="w-3.5 h-3.5 text-amber-800" />
                            <span className="hidden sm:inline">Import .GED</span>
                          </button>
                        )}

                        {/* Supprimer définitivement l'arbre (créateur uniquement) ; sinon simple retrait de la liste */}
                        {(tree.isCreator || isTreeCreatedLocally(tree.id)) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteDialog(tree);
                            }}
                            className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Supprimer définitivement cet arbre (si vous vous êtes trompé ou si l'import s'est mal passé)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : tree.id !== currentRoomId && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteLocal(e, tree.id)}
                            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                            title="Retirer de ma liste (l'arbre partagé n'est pas supprimé)"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {filteredTrees.length === 0 && (
                  <div className="p-8 text-center text-xs text-stone-500 dark:text-stone-400 space-y-2">
                    <p>Aucun arbre ne correspond à votre recherche.</p>
                    {userRole === 'admin' ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab('create')}
                        className="text-amber-800 dark:text-amber-400 font-semibold underline cursor-pointer"
                      >
                        Créer un nouvel arbre maintenant →
                      </button>
                    ) : (
                      <p className="text-[11px] text-stone-400">
                        En tant que profil lecteur, la création d'arbre n'est pas autorisée.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Raccourci pour rejoindre par ID direct */}
              <div className="pt-3 border-t border-stone-200 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400 flex items-center justify-between">
                <span>Vous possédez un identifiant de salon partagé par un proche ?</span>
                <button
                  type="button"
                  onClick={() => {
                    const id = prompt('Entrez l\'identifiant de salon (ex: famille-dupont-1850) :');
                    if (id && isValidTreeId(slugifyTreeId(id))) {
                      handleSelectTree(slugifyTreeId(id));
                    }
                  }}
                  className="font-semibold text-amber-800 dark:text-amber-400 hover:underline cursor-pointer"
                >
                  Rejoindre par identifiant →
                </button>
              </div>

            </div>
          )}

          {/* ONGLET 2 : CRÉER UN NOUVEL ARBRE */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              
              <div className="space-y-3 bg-white dark:bg-stone-900/60 p-4 rounded-xl border border-stone-200 dark:border-stone-800">
                
                {/* Titre de l'arbre */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                      Nom de la Famille ou Titre de l'Arbre
                    </label>
                    <InfoTooltip content="Nom d'affichage qui apparaîtra dans la barre supérieure et sur les fiches (ex: Famille Bernard, Lignée de Keravel)." />
                  </div>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={e => handleTitleChange(e.target.value)}
                    placeholder="Ex: Famille Bernard, Généalogie d'Auvergne..."
                    className="w-full text-xs bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                </div>

                {/* Slug / Identifiant de salon */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <label className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                      Identifiant unique du salon (URL & Firestore)
                    </label>
                    <InfoTooltip content="Identifiant technique unique utilisé dans l'URL ?room=... et dans les règles de stockage Firestore. Lettres minuscules, chiffres et tirets uniquement." />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-2 rounded-lg border border-stone-200 dark:border-stone-700 select-none">
                      ?room=
                    </span>
                    <input
                      type="text"
                      required
                      value={newSlug}
                      onChange={e => handleSlugChange(e.target.value)}
                      placeholder="famille-bernard"
                      className="w-full text-xs font-mono bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg p-2.5 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
                    />
                  </div>
                  <span className="text-[11px] text-stone-500 font-mono mt-1 block">
                    Format : 3 à 64 caractères, uniquement a-z, 0-9 et tirets (-)
                  </span>
                </div>

              </div>

              {/* Options post-création */}
              <div className="bg-white dark:bg-stone-900/60 p-4 rounded-xl border border-stone-200 dark:border-stone-800 space-y-2.5">
                <label className="text-xs font-bold uppercase tracking-wider font-mono text-stone-700 dark:text-stone-300 block">
                  Étape suivante après création :
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    createActionOption === 'gedcom' 
                      ? 'border-amber-700 bg-amber-50/80 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 font-semibold shadow-2xs' 
                      : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
                  }`}>
                    <input 
                      type="radio" 
                      name="createAction" 
                      checked={createActionOption === 'gedcom'} 
                      onChange={() => setCreateActionOption('gedcom')} 
                      className="mt-0.5 text-amber-800 focus:ring-amber-800"
                    />
                    <div>
                      <span className="block font-bold">1: Créer puis 2: Importer .GED</span>
                      <span className="text-[11px] font-normal text-stone-500 mt-0.5 block">
                        Ouvre directement l'import GEDCOM pour peupler ce nouvel arbre.
                      </span>
                    </div>
                  </label>

                  <label className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    createActionOption === 'empty' 
                      ? 'border-amber-700 bg-amber-50/80 dark:bg-amber-950/40 text-amber-950 dark:text-amber-200 font-semibold shadow-2xs' 
                      : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800'
                  }`}>
                    <input 
                      type="radio" 
                      name="createAction" 
                      checked={createActionOption === 'empty'} 
                      onChange={() => setCreateActionOption('empty')} 
                      className="mt-0.5 text-amber-800 focus:ring-amber-800"
                    />
                    <div>
                      <span className="block font-bold">Partir d'un arbre vierge</span>
                      <span className="text-[11px] font-normal text-stone-500 mt-0.5 block">
                        Démarrer la saisie manuelle sans fichier GEDCOM.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Information d'initialisation */}
              <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-300">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
                <p className="leading-relaxed">
                  Le nouvel arbre sera créé et vous en serez l'administrateur exclusif. Vous pourrez à tout moment le supprimer si l'import s'est mal passé ou pour recommencer.
                </p>
              </div>

              {formError && (
                <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Boutons formulaire */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('switch')}
                  className="px-4 py-2 text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 dark:bg-amber-800 dark:hover:bg-amber-700 rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {createActionOption === 'gedcom' ? 'Créer l\'arbre et Importer le .GED' : 'Créer et Ouvrir l\'Arbre'}
                  </span>
                </button>
              </div>

            </form>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200/80 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/60 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            <span>Chaque arbre dispose de son propre salon WebSocket et de ses collections d'archives étanches.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="font-medium hover:text-stone-800 dark:hover:text-stone-200 cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>

      {/* MODALE DE CONFIRMATION DE SUPPRESSION D'ARBRE */}
      {treeToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                  Supprimer définitivement l'arbre ?
                </h3>
                <p className="text-xs text-stone-500 font-mono">
                  {treeToDelete.title} ({treeToDelete.id})
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-stone-600 dark:text-stone-400 leading-relaxed bg-rose-50/50 dark:bg-rose-950/30 p-3.5 rounded-xl border border-rose-100 dark:border-rose-900/50">
              <p>
                Cette action effacera complètement toutes les données locales et distantes de cet arbre (individus, familles et archives associées).
              </p>
              <p className="font-semibold text-rose-900 dark:text-rose-300">
                Idéal si vous vous êtes trompé de fichier, si l'import s'est mal passé ou pour recommencer proprement.
              </p>
              <p>
                Pensez à exporter une sauvegarde (menu Fichiers &amp; Sauvegardes) si vous souhaitez conserver une copie.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="delete-confirm" className="block text-xs text-stone-700 dark:text-stone-300">
                Pour confirmer, saisissez l'identifiant <strong className="font-mono">{treeToDelete.id}</strong> :
              </label>
              <input
                id="delete-confirm"
                type="text"
                autoComplete="off"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="w-full text-xs font-mono bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-lg px-3 py-2 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-rose-600"
              />
            </div>

            {deleteError && (
              <p className="text-xs text-rose-700 dark:text-rose-400">{deleteError}</p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setTreeToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-xl transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isDeleting || deleteConfirmText.trim() !== treeToDelete.id}
                onClick={handleConfirmDeleteTree}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
              >
                {isDeleting ? (
                  <span>Suppression en cours...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Supprimer définitivement</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
