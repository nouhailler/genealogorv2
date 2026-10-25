import { 
  X, GitFork, Users, BookOpen, Clock, MapPin, BarChart3, 
  Share2, Shield, Download, Upload, Settings, RefreshCw, 
  Moon, Sun, HelpCircle, HardDrive, Sparkles, Tag, ChevronRight,
  ShieldAlert, Smartphone, Database, Check, FolderTree,
  Layers, Network, ShieldCheck, Columns, Building2
} from 'lucide-react';
import { ActiveTab } from './Navbar';
import { Logo } from './Logo';
import { PwaInstallButton } from './PwaInstallButton';
import { ThemeMode } from '../lib/theme';
import { APP_METADATA } from '../lib/version-service';

interface HamburgerMenuProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenShareModal: () => void;
  onOpenExportModal: () => void;
  onOpenSystemSettings: () => void;
  onOpenOnboarding: () => void;
  onOpenTreeManager: () => void;
  onOpenDeptDirectory?: () => void;
  currentRoomId: string;
  currentTreeTitle: string;
  personCount?: number;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  isCloudSynced: boolean;
  isWsConnected: boolean;
  userRole?: import('../types/genealogy').BranchRole;
}

export const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  onOpenShareModal,
  onOpenExportModal,
  onOpenSystemSettings,
  onOpenOnboarding,
  onOpenTreeManager,
  onOpenDeptDirectory,
  currentRoomId,
  currentTreeTitle,
  personCount,
  themeMode,
  onToggleTheme,
  isCloudSynced,
  isWsConnected,
  userRole = 'viewer',
}) => {
  if (!isOpen) return null;

  const navigateTo = (tab: ActiveTab) => {
    onTabChange(tab);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div 
        role="dialog"
        aria-modal="true"
        aria-label="Menu principal des fonctionnalités"
        className="relative ml-auto w-full max-w-sm sm:max-w-md h-full bg-[#FBF9F5] dark:bg-[#15181E] border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col text-stone-900 dark:text-stone-100 z-10 transition-colors"
      >
        
        {/* Header Drawer */}
        <div className="p-4 sm:p-5 border-b border-stone-200/80 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/60 flex items-center justify-between">
          <Logo size="md" showText={true} />
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 rounded-xl hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            aria-label="Fermer le menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Categories Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6 text-sm">
          
          {/* SECTION DÉDIÉE : SÉLECTEUR VISUEL D'ARBRE ACTIF */}
          <div className="p-3.5 bg-linear-to-br from-amber-50/90 to-stone-100/90 dark:from-stone-900/90 dark:to-stone-950/90 rounded-2xl border border-amber-200/90 dark:border-amber-900/50 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-900 dark:text-amber-400 flex items-center gap-1.5">
                <FolderTree className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                Arbre en cours
              </span>
              {userRole === 'admin' ? (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  👑 Profil Créateur
                </span>
              ) : (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-900 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
                  👁️ Profil Lecteur
                </span>
              )}
            </div>

            <div>
              <h3 className="font-serif font-bold text-base text-stone-900 dark:text-stone-100 truncate">
                {currentTreeTitle || currentRoomId || 'Mon Arbre'}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400 font-mono mt-0.5">
                <span>Salon: {currentRoomId}</span>
                {personCount !== undefined && (
                  <>
                    <span>•</span>
                    <span>{personCount} pers.</span>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTreeManager();
              }}
              className="w-full py-2.5 px-3 rounded-xl text-xs font-semibold bg-amber-900 hover:bg-amber-950 dark:bg-amber-800 dark:hover:bg-amber-700 text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <FolderTree className="w-4 h-4" />
              <span>{userRole === 'admin' ? "Créer / Changer d'Arbre" : "Changer d'Arbre"}</span>
            </button>
          </div>

          {/* CATÉGORIE 1 : EXPLORATION GÉNÉALOGIQUE */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-400 flex items-center gap-1.5 px-2">
              <GitFork className="w-3.5 h-3.5" />
              Exploration Généalogique
            </span>

            <div className="space-y-1 bg-white/70 dark:bg-stone-900/40 p-1.5 rounded-xl border border-stone-200/70 dark:border-stone-800/80">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTreeManager();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <FolderTree className="w-4 h-4 text-amber-800 dark:text-amber-400" />
                  <span>Gestionnaire Multi-Arbres</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                  Changer
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigateTo('tree')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'tree' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <GitFork className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  <span>Arbre & Ascendance (Sosa)</span>
                </div>
                {activeTab === 'tree' && <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('ancestors')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'ancestors' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Éventail Sosa & Pedigree</span>
                </div>
                {activeTab === 'ancestors' && <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('descendants')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'descendants' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <GitFork className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Descendance d'Aboville</span>
                </div>
                {activeTab === 'descendants' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('graph')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'graph' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Network className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Graphe Relationnel D3</span>
                </div>
                {activeTab === 'graph' && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('compare')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'compare' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Columns className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Comparateur de Fiches</span>
                </div>
                {activeTab === 'compare' && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('profile')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'profile' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                  <span>Fiche Individuelle</span>
                </div>
                {activeTab === 'profile' && <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('timeline')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'timeline' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                  <span>Chronologie Historique</span>
                </div>
                {activeTab === 'timeline' && <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('map')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'map' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                  <span>Carte des Migrations</span>
                </div>
                {activeTab === 'map' && <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('stats')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'stats' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-4 h-4 text-stone-600 dark:text-stone-400" />
                  <span>Statistiques Démographiques</span>
                </div>
                {activeTab === 'stats' && <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />}
              </button>
            </div>
          </div>

          {/* CATÉGORIE 2 : ANALYSES, ENDOGAMIE & QUALITÉ */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-400 flex items-center gap-1.5 px-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              Analyses, Implexe & Qualité
            </span>

            <div className="space-y-1 bg-white/70 dark:bg-stone-900/40 p-1.5 rounded-xl border border-stone-200/70 dark:border-stone-800/80">
              <button
                type="button"
                onClick={() => navigateTo('implex')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'implex' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Network className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  <span>Calcul d'Implexe & Endogamie</span>
                </div>
                {activeTab === 'implex' && <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('validation')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'validation' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-red-700 dark:text-red-400" />
                  <span>Contrôle Qualité & Cycles</span>
                </div>
                {activeTab === 'validation' && <span className="w-1.5 h-1.5 rounded-full bg-red-600" />}
              </button>

              {onOpenDeptDirectory && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDeptDirectory();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <Building2 className="w-4 h-4 text-amber-800 dark:text-amber-400" />
                    <span>Archives Départementales (97)</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                    Portails
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* CATÉGORIE 3 : ARCHIVES & PALÉOGRAPHIE */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-400 flex items-center gap-1.5 px-2">
              <BookOpen className="w-3.5 h-3.5" />
              Archives, Paléographie & Photos
            </span>

            <div className="space-y-1 bg-white/70 dark:bg-stone-900/40 p-1.5 rounded-xl border border-stone-200/70 dark:border-stone-800/80">
              <button
                type="button"
                onClick={() => navigateTo('archives')}
                className={`w-full flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'archives' ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 font-semibold' : 'hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <BookOpen className="w-4 h-4 text-amber-800 dark:text-amber-400" />
                  <span>Studio d'Archives & Transcription</span>
                </div>
                {activeTab === 'archives' && <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />}
              </button>

              <button
                type="button"
                onClick={() => navigateTo('archives')}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <Tag className="w-4 h-4 text-stone-500" />
                  <span>Marquage Photo (Photo Tagging)</span>
                </div>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-mono">
                  Interactif
                </span>
              </button>
            </div>
          </div>

          {/* CATÉGORIE 3 : SÉCURITÉ & PARTAGE PAR BRANCHE */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-400 flex items-center gap-1.5 px-2">
              <Shield className="w-3.5 h-3.5" />
              Partage Sécurisé & Branches
            </span>

            <div className="p-3 bg-white/70 dark:bg-stone-900/40 rounded-xl border border-stone-200/70 dark:border-stone-800/80 space-y-2">
              <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                Générez des liens privés par branche protégés par hachage PBKDF2 sans compte obligatoire pour vos cousins.
              </p>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShareModal();
                }}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Gérer les Liens & Mots de Passe</span>
              </button>
            </div>
          </div>

          {/* CATÉGORIE 4 : DONNÉES & SAUVEGARDES */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-400 flex items-center gap-1.5 px-2">
              <HardDrive className="w-3.5 h-3.5" />
              Sauvegardes & GEDCOM
            </span>

            <div className="space-y-1 bg-white/70 dark:bg-stone-900/40 p-1.5 rounded-xl border border-stone-200/70 dark:border-stone-800/80">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenExportModal();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Download className="w-4 h-4 text-stone-500" />
                  <span>Sauvegarde Chiffrée AES-GCM 256</span>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenExportModal();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Upload className="w-4 h-4 text-stone-500" />
                  <span>Import / Export GEDCOM 5.5.1</span>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>
            </div>
          </div>

          {/* CATÉGORIE 5 : INSTALLATION PWA */}
          <div className="space-y-2">
            <PwaInstallButton variant="menu-item" />
          </div>

          {/* CATÉGORIE 6 : SYSTÈME, THÈME & INFORMATIONS */}
          <div className="space-y-2 pt-2 border-t border-stone-200 dark:border-stone-800">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 flex items-center gap-1.5 px-2">
              <Settings className="w-3.5 h-3.5" />
              Système & Préférences
            </span>

            <div className="space-y-1 bg-white/70 dark:bg-stone-900/40 p-1.5 rounded-xl border border-stone-200/70 dark:border-stone-800/80">
              {/* Bascule thème sombre */}
              <button
                type="button"
                onClick={onToggleTheme}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  {themeMode === 'dark' ? (
                    <Sun className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Moon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  )}
                  <span>Thème : {themeMode === 'dark' ? 'Sombre' : themeMode === 'light' ? 'Clair' : 'Système'}</span>
                </div>
                <span className="text-[11px] font-mono text-stone-400">
                  {themeMode === 'dark' ? 'Ardoise' : 'Parchemin'}
                </span>
              </button>

              {/* Paramètres système */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSystemSettings();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <RefreshCw className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  <span>Paramètres Système & Mises à Jour</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                  v{APP_METADATA.version}
                </span>
              </button>

              {/* Mentions légales */}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenOnboarding();
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800/60 text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Mentions Légales & Non-Responsabilité</span>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400" />
              </button>
            </div>
          </div>

        </div>

        {/* Footer Drawer */}
        <div className="p-4 border-t border-stone-200/80 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/60 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isCloudSynced ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="font-mono text-[11px]">{isCloudSynced ? 'Cloud Firestore' : 'Local'}</span>
          </div>
          <span className="text-[10px] font-mono">
            {APP_METADATA.version} · {APP_METADATA.releaseDate}
          </span>
        </div>

      </div>
    </div>
  );
};
