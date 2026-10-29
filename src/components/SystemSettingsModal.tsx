import React, { useState, useEffect } from 'react';
import { 
  X, RefreshCw, Download, CheckCircle2, AlertCircle, Clock, 
  Calendar, Moon, Sun, Monitor, ShieldCheck, Database, HardDrive, 
  HelpCircle, Sparkles, Layers, ArrowUpRight
} from 'lucide-react';
import { versionService, VersionInfo, APP_METADATA } from '../lib/version-service';
import { getStoredTheme, applyTheme, ThemeMode } from '../lib/theme';
import { areContextGuidesEnabled, setContextGuidesEnabled } from './ContextualGuide';
import { Logo } from './Logo';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenOnboarding: () => void;
  isWsConnected: boolean;
  isCloudSynced: boolean;
}

export const SystemSettingsModal: React.FC<SystemSettingsModalProps> = ({
  isOpen,
  onClose,
  onOpenOnboarding,
  isWsConnected,
  isCloudSynced,
}) => {
  const [versionInfo, setVersionInfo] = useState<VersionInfo>(versionService.getVersionInfo());
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredTheme());
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(versionService.isAutoUpdateEnabled());
  const [autoUpdateInterval, setAutoUpdateInterval] = useState(versionService.getAutoUpdateInterval());
  const [guidesEnabled, setGuidesEnabledState] = useState(areContextGuidesEnabled());
  const [toastFeedback, setToastFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsub = versionService.subscribe((info) => {
      setVersionInfo(info);
    });
    return () => unsub();
  }, []);

  if (!isOpen) return null;

  const showFeedback = (msg: string) => {
    setToastFeedback(msg);
    setTimeout(() => setToastFeedback(null), 3000);
  };

  const handleManualCheck = async () => {
    const res = await versionService.checkForUpdates();
    if (res.isUpdateAvailable) {
      showFeedback('Nouvelle version détectée ! Cliquez sur Forcer la mise à jour.');
    } else {
      showFeedback('Votre application Genealogor est parfaitement à jour.');
    }
  };

  const handleForceUpdate = async () => {
    showFeedback('Purge des caches et rechargement de la dernière version...');
    await versionService.forceUpdate();
  };

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyTheme(mode);
  };

  const handleToggleAutoUpdate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setAutoUpdateEnabled(checked);
    versionService.setAutoUpdateEnabled(checked);
    showFeedback(checked ? 'Mises à jour automatiques activées.' : 'Mises à jour automatiques désactivées.');
  };

  const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mins = parseInt(e.target.value, 10);
    setAutoUpdateInterval(mins);
    versionService.setAutoUpdateInterval(mins);
    showFeedback(`Fréquence d'analyse fixée à ${mins} minutes.`);
  };

  const handleToggleGuides = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setGuidesEnabledState(checked);
    setContextGuidesEnabled(checked);
    showFeedback(checked ? 'Guides et infobulles contextuels activés.' : 'Guides masqués.');
  };

  const formatLastCheck = (timestamp?: number) => {
    if (!timestamp) return 'Aucune vérification enregistrée';
    const d = new Date(timestamp);
    return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-settings-title"
        className="bg-[#FBF9F5] dark:bg-[#181B22] border border-stone-300 dark:border-stone-700 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100 transition-colors"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/60">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <div>
              <h2 id="system-settings-title" className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                Paramètres Système & Mises à Jour
              </h2>
              <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">
                Genealogor v{APP_METADATA.version} · Canal {APP_METADATA.channel}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded-lg hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">
          
          {/* Notification feedback toast */}
          {toastFeedback && (
            <div className="p-3 bg-amber-100 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl text-xs text-amber-950 dark:text-amber-200 font-medium flex items-center gap-2 animate-in fade-in">
              <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
              <span>{toastFeedback}</span>
            </div>
          )}

          {/* Section 1 : État des Versions & Mises à Jour */}
          <div className="p-4 bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-400 flex items-center gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${versionInfo.status === 'checking' ? 'animate-spin' : ''}`} />
                Version & Maintenance Logicielle
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                {versionInfo.status === 'checking' ? 'Vérification...' : versionInfo.isUpdateAvailable ? 'Mise à jour dispo' : 'À jour'}
              </span>
            </div>

            {/* Version stats grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-800/40 border border-stone-200/70 dark:border-stone-700/60">
                <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-xs mb-1">
                  <Calendar className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                  <span>Date de sortie officielle</span>
                </div>
                <div className="font-semibold text-sm text-stone-900 dark:text-stone-100">
                  {APP_METADATA.releaseDate}
                </div>
                <div className="text-[10px] font-mono text-stone-500 mt-0.5">
                  Build : {APP_METADATA.buildHash}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-stone-50 dark:bg-stone-800/40 border border-stone-200/70 dark:border-stone-700/60">
                <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-xs mb-1">
                  <Clock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                  <span>Dernière vérification</span>
                </div>
                <div className="font-semibold text-xs text-stone-900 dark:text-stone-100">
                  {formatLastCheck(versionInfo.lastCheckedTime)}
                </div>
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Dépôt GitHub synchronisé</span>
                </div>
              </div>
            </div>

            {/* Boutons d'action : Vérifier & Forcer */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleManualCheck}
                disabled={versionInfo.status === 'checking'}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white flex items-center gap-2 shadow-xs transition-all active:scale-98 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${versionInfo.status === 'checking' ? 'animate-spin' : ''}`} />
                <span>Vérifier les mises à jour</span>
              </button>

              <button
                type="button"
                onClick={handleForceUpdate}
                disabled={versionInfo.status === 'updating'}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center gap-2 shadow-2xs transition-all active:scale-98 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                <span>Forcer la mise à jour</span>
              </button>
            </div>

            {/* Mises à jour en arrière-plan */}
            <div className="pt-3 border-t border-stone-200/80 dark:border-stone-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-xs text-stone-900 dark:text-stone-100 block">
                    Mises à jour automatiques en arrière-plan
                  </span>
                  <span className="text-[11px] text-stone-500 dark:text-stone-400">
                    Vérifie discrètement la disponibilité de nouveaux patchs et télécharge les assets.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoUpdateEnabled}
                    onChange={handleToggleAutoUpdate}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-stone-300 peer-focus:outline-none rounded-full peer dark:bg-stone-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-800"></div>
                </label>
              </div>

              {autoUpdateEnabled && (
                <div className="flex items-center justify-between text-xs bg-stone-50 dark:bg-stone-800/40 p-2.5 rounded-lg">
                  <span className="text-stone-600 dark:text-stone-400">
                    Fréquence de vérification :
                  </span>
                  <select
                    value={autoUpdateInterval}
                    onChange={handleIntervalChange}
                    className="px-2.5 py-1 rounded-md bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-xs font-medium cursor-pointer"
                  >
                    <option value={15}>Toutes les 15 minutes</option>
                    <option value={30}>Toutes les 30 minutes (recommandé)</option>
                    <option value={60}>Toutes les heures</option>
                    <option value={360}>Toutes les 6 heures</option>
                    <option value={1440}>Une fois par jour</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Section 2 : Apparence & Thème Sombre */}
          <div className="p-4 bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-xl space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-400 flex items-center gap-1.5">
              <Moon className="w-3.5 h-3.5" />
              Thème & Apparence Visuelle
            </span>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Choisissez le thème d'affichage. Le mode sombre utilise une palette feutrée haute lisibilité spécialement étudiée pour l'examen des actes anciens et des photos d'époque.
            </p>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleThemeChange('light')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                  themeMode === 'light'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-600 dark:border-amber-500 font-bold text-amber-950 dark:text-amber-200 shadow-xs'
                    : 'bg-stone-50 dark:bg-stone-800/50 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100'
                }`}
              >
                <Sun className="w-5 h-5 text-amber-600" />
                <span className="text-xs">Clair (Parchemin)</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeChange('dark')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                  themeMode === 'dark'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-600 dark:border-amber-500 font-bold text-amber-950 dark:text-amber-200 shadow-xs'
                    : 'bg-stone-50 dark:bg-stone-800/50 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100'
                }`}
              >
                <Moon className="w-5 h-5 text-indigo-400" />
                <span className="text-xs">Sombre (Ardoise)</span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeChange('system')}
                className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all cursor-pointer ${
                  themeMode === 'system'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-600 dark:border-amber-500 font-bold text-amber-950 dark:text-amber-200 shadow-xs'
                    : 'bg-stone-50 dark:bg-stone-800/50 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-100'
                }`}
              >
                <Monitor className="w-5 h-5 text-stone-500" />
                <span className="text-xs">Automatique (Système)</span>
              </button>
            </div>
          </div>

          {/* Section 3 : Aide contextuelle & Mentions Légales */}
          <div className="p-4 bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-xl space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-400 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" />
              Guides & Mentions Légales
            </span>

            <div className="flex items-center justify-between pt-1">
              <div>
                <span className="font-semibold text-xs text-stone-900 dark:text-stone-100 block">
                  Infobulles et guides d'écran contextuels
                </span>
                <span className="text-[11px] text-stone-500 dark:text-stone-400">
                  Affiche les bandeaux d'aide et repères d'information sur chaque vue.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={guidesEnabled}
                  onChange={handleToggleGuides}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-stone-300 peer-focus:outline-none rounded-full peer dark:bg-stone-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-800"></div>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenOnboarding();
                }}
                className="w-full py-2 px-3 text-xs font-medium text-stone-700 dark:text-stone-300 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 rounded-lg flex items-center justify-between transition-colors cursor-pointer"
              >
                <span>Revoir les mentions légales de non-responsabilité et la présentation</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" />
              </button>
              <a
                href="/decouvrir/"
                target="_blank"
                rel="noopener"
                className="mt-2 w-full py-2 px-3 text-xs font-medium text-stone-700 dark:text-stone-300 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 rounded-lg flex items-center justify-between transition-colors cursor-pointer"
              >
                <span>À propos de Genealogor : fonctionnalités, données personnelles, FAQ</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-stone-400" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Section 4 : Diagnostics Système */}
          <div className="p-4 bg-stone-50 dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 rounded-xl space-y-2 text-xs">
            <span className="font-bold text-[11px] uppercase tracking-wider text-stone-500 block">
              État de l'Infrastructure
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
              <div className="p-2 rounded bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
                <span className="text-stone-500 block">Relais WebSocket</span>
                <span className={`font-semibold ${isWsConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-500'}`}>
                  {isWsConnected ? 'Connecté (TLS)' : 'Local / Channel'}
                </span>
              </div>
              <div className="p-2 rounded bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
                <span className="text-stone-500 block">Persistance Cloud</span>
                <span className={`font-semibold ${isCloudSynced ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-600'}`}>
                  {isCloudSynced ? 'Firestore Actif' : 'Disque Local'}
                </span>
              </div>
              <div className="p-2 rounded bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
                <span className="text-stone-500 block">Conteneurs v2</span>
                <span className="font-semibold text-stone-800 dark:text-stone-200">
                  Versionnés & Chiffrés
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-stone-200 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-stone-800 hover:bg-stone-900 text-white dark:bg-stone-700 dark:hover:bg-stone-600 transition-colors cursor-pointer"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
