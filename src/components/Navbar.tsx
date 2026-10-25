import { 
  Share2, Users, Shield, BookOpen, Clock, MapPin, BarChart3, 
  GitFork, LogIn, LogOut, CloudCheck, Cloud, Menu, Moon, Sun, 
  Settings, Download, FolderTree
} from 'lucide-react';
import { BranchAccess, BranchRole } from '../types/genealogy';
import { User as FirebaseUser } from 'firebase/auth';
import { Logo } from './Logo';
import { ThemeMode } from '../lib/theme';
import { PwaInstallButton } from './PwaInstallButton';

export type ActiveTab = 
  | 'tree' 
  | 'profile' 
  | 'archives' 
  | 'timeline' 
  | 'map' 
  | 'stats'
  | 'ancestors' 
  | 'descendants' 
  | 'implex' 
  | 'validation' 
  | 'compare' 
  | 'graph';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenShareModal: () => void;
  onOpenExportModal: () => void;
  onOpenHamburgerMenu: () => void;
  onOpenSystemSettings: () => void;
  onOpenTreeManager?: () => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  currentAccess?: BranchAccess;
  userRole: BranchRole;
  connectedPeerCount: number;
  isWsConnected: boolean;
  treeTitle: string;
  currentUser: FirebaseUser | null;
  onLogin: () => void;
  onLogout: () => void;
  isCloudSynced: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  onOpenShareModal,
  onOpenExportModal,
  onOpenHamburgerMenu,
  onOpenSystemSettings,
  onOpenTreeManager,
  themeMode,
  onToggleTheme,
  currentAccess,
  userRole,
  connectedPeerCount,
  isWsConnected,
  treeTitle,
  currentUser,
  onLogin,
  onLogout,
  isCloudSynced,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#FBF9F5]/95 dark:bg-[#121418]/95 backdrop-blur-md border-b border-stone-200/80 dark:border-stone-800 px-4 md:px-8 py-2.5 transition-colors duration-200">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Zone 1: Hamburger Menu + Logo + Title (peut se réduire : le titre de l'arbre est tronqué sur petit écran) */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenHamburgerMenu}
            className="p-2 rounded-xl text-stone-700 dark:text-stone-300 hover:text-stone-950 dark:hover:text-stone-50 hover:bg-stone-200/60 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title="Ouvrir le menu des fonctionnalités (Menu Hamburger)"
            aria-label="Menu principal"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            onClick={() => onTabChange('tree')}
            className="flex items-center gap-2.5 text-left group focus:outline-none cursor-pointer shrink-0"
            aria-label="Genealogor — retour à l'arbre"
          >
            <Logo size="sm" />
            {/* Nom de l'application masqué sur les écrans très étroits (le logo reste) */}
            <div className="hidden min-[440px]:flex flex-col">
              <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50 group-hover:text-amber-800 dark:group-hover:text-amber-400 transition-colors leading-none">
                Genealogor
              </span>
              <span className="hidden sm:inline-block text-[10px] font-mono text-stone-500 dark:text-stone-400 tracking-wider">
                {currentAccess?.branch === 'paternal' ? '· Branche Paternelle' : currentAccess?.branch === 'maternal' ? '· Branche Maternelle' : '· Arbre & Archives'}
              </span>
            </div>
          </button>

          {/* Lecteur : titre seul, la gestion des arbres est réservée à l'administrateur */}
          {userRole !== 'admin' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold text-stone-800 dark:text-stone-200 bg-stone-100/80 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 min-w-0">
              <FolderTree className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400" />
              <span className="truncate max-w-[160px]">{treeTitle}</span>
            </span>
          )}

          {onOpenTreeManager && userRole === 'admin' && (
            <button
              type="button"
              onClick={onOpenTreeManager}
              title="Gérer mes arbres généalogiques (Créer, Changer, Supprimer)"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold text-stone-800 dark:text-stone-200 bg-amber-50/90 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-300/80 dark:border-amber-800 transition-all cursor-pointer shadow-2xs group min-w-0"
            >
              <FolderTree className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400 group-hover:scale-105 transition-transform" />
              <span className="truncate max-w-[140px] font-bold">{treeTitle}</span>
              <span className="text-[10px] text-amber-900/70 dark:text-amber-300/70 font-mono">▾ Gérer</span>
            </button>
          )}

          {/* Badge Profil 1 vs Profil 2 */}
          {userRole === 'admin' ? (
            <span 
              title="Profil Créateur / Administrateur : Vous avez créé cet arbre et disposez de tous les droits de gestion et de création." 
              className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300/70 dark:border-amber-800 select-none"
            >
              👑 Créateur
            </span>
          ) : (
            <span 
              title="Profil Lecteur (par défaut) : Consultation de l'arbre partagé. En aucun cas le lecteur ne peut créer d'arbre." 
              className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-sky-100 dark:bg-sky-950/80 text-sky-900 dark:text-sky-300 border border-sky-300/70 dark:border-sky-800 select-none"
            >
              👁️ Lecteur
            </span>
          )}
        </div>

        {/* Zone 2: Navigation Links (Desktop) */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2 text-sm font-medium text-stone-600 dark:text-stone-300">
          <button
            onClick={() => onTabChange('tree')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'tree' ? 'text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/50 font-semibold shadow-2xs' : 'hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100/70 dark:hover:bg-stone-800/60'
            }`}
          >
            <GitFork className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            <span>Arbre</span>
          </button>

          <button
            onClick={() => onTabChange('profile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'profile' ? 'text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/50 font-semibold shadow-2xs' : 'hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100/70 dark:hover:bg-stone-800/60'
            }`}
          >
            <Users className="w-4 h-4 text-stone-600 dark:text-stone-400" />
            <span>Fiche Individu</span>
          </button>

          <button
            onClick={() => onTabChange('archives')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'archives' ? 'text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/50 font-semibold shadow-2xs' : 'hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100/70 dark:hover:bg-stone-800/60'
            }`}
          >
            <BookOpen className="w-4 h-4 text-amber-800 dark:text-amber-400" />
            <span>Archives & Actes</span>
          </button>

          <button
            onClick={() => onTabChange('timeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'timeline' ? 'text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/50 font-semibold shadow-2xs' : 'hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100/70 dark:hover:bg-stone-800/60'
            }`}
          >
            <Clock className="w-4 h-4 text-stone-600 dark:text-stone-400" />
            <span>Chronologie</span>
          </button>

          <button
            onClick={() => onTabChange('map')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'map' ? 'text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/50 font-semibold shadow-2xs' : 'hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100/70 dark:hover:bg-stone-800/60'
            }`}
          >
            <MapPin className="w-4 h-4 text-stone-600 dark:text-stone-400" />
            <span>Carte</span>
          </button>

          <button
            onClick={() => onTabChange('stats')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'stats' ? 'text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/50 font-semibold shadow-2xs' : 'hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100/70 dark:hover:bg-stone-800/60'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-stone-600 dark:text-stone-400" />
            <span>Statistiques</span>
          </button>
        </nav>

        {/* Zone 3: Quick utilities + PWA Install + Theme + Share + Auth */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          
          {/* PWA Install Button */}
          <PwaInstallButton variant="nav" />

          {/* Quick theme toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            title={`Basculer le thème (Actuellement : ${themeMode})`}
            className="p-1.5 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            {themeMode === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-stone-700" />
            )}
          </button>

          {/* System Settings Button */}
          <button
            type="button"
            onClick={onOpenSystemSettings}
            title="Paramètres système & Mises à jour"
            className="p-1.5 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Bouton de partage sécurisé (administrateur uniquement) */}
          {userRole === 'admin' && (
            <button
              onClick={onOpenShareModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold tracking-wide text-white bg-amber-900 hover:bg-amber-950 dark:bg-amber-800 dark:hover:bg-amber-700 active:scale-98 rounded-lg shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Partager</span>
            </button>
          )}

          {/* User Auth with Google */}
          {currentUser ? (
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-stone-200 dark:border-stone-800">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Utilisateur'}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-full border border-stone-300 dark:border-stone-700 object-cover"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-bold text-xs flex items-center justify-center">
                  {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <button
                onClick={onLogout}
                title="Déconnexion"
                className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : userRole === 'admin' && (
            // Connexion Google réservée à l'administrateur (sauvegarde Firestore, liens de partage) :
            // un lecteur reçoit l'arbre par son lien et la connexion ne lui donnerait aucun droit
            <button
              onClick={onLogin}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700 rounded-lg shadow-2xs transition-all whitespace-nowrap cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400" />
              <span className="hidden sm:inline">Connexion</span>
            </button>
          )}

        </div>
      </div>

      {/* Mobile nav bar navigation */}
      <div className="lg:hidden flex items-center justify-between gap-1 overflow-x-auto pt-2 pb-0.5 border-t border-stone-200/60 dark:border-stone-800 mt-2 text-xs">
        <button
          onClick={() => onTabChange('tree')}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap ${activeTab === 'tree' ? 'font-bold text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/60' : 'text-stone-600 dark:text-stone-400'}`}
        >
          Arbre
        </button>
        <button
          onClick={() => onTabChange('profile')}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap ${activeTab === 'profile' ? 'font-bold text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/60' : 'text-stone-600 dark:text-stone-400'}`}
        >
          Fiche
        </button>
        <button
          onClick={() => onTabChange('archives')}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap ${activeTab === 'archives' ? 'font-bold text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/60' : 'text-stone-600 dark:text-stone-400'}`}
        >
          Archives & Actes
        </button>
        <button
          onClick={() => onTabChange('timeline')}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap ${activeTab === 'timeline' ? 'font-bold text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/60' : 'text-stone-600 dark:text-stone-400'}`}
        >
          Chronologie
        </button>
        <button
          onClick={() => onTabChange('map')}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap ${activeTab === 'map' ? 'font-bold text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/60' : 'text-stone-600 dark:text-stone-400'}`}
        >
          Carte
        </button>
        <button
          onClick={() => onTabChange('stats')}
          className={`px-2.5 py-1 rounded-md whitespace-nowrap ${activeTab === 'stats' ? 'font-bold text-amber-950 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/60' : 'text-stone-600 dark:text-stone-400'}`}
        >
          Stats
        </button>
      </div>
    </header>
  );
};
