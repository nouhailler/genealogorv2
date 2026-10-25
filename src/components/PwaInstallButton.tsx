import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Check, Share, PlusSquare, X, Monitor } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaInstallButtonProps {
  className?: string;
  variant?: 'button' | 'nav' | 'menu-item';
  onInstalled?: () => void;
}

export const PwaInstallButton: React.FC<PwaInstallButtonProps> = ({
  className = '',
  variant = 'button',
  onInstalled,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isIos, setIsIos] = useState<boolean>(false);
  const [showIosModal, setShowIosModal] = useState<boolean>(false);

  useEffect(() => {
    // Check if already in standalone mode
    if (typeof window !== 'undefined') {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      setIsInstalled(isStandalone);

      // Detect iOS Safari
      const ua = window.navigator.userAgent.toLowerCase();
      const isIosDevice = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
      setIsIos(isIosDevice);

      // Listen for browser install prompt (Chrome, Edge, Android)
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e as BeforeInstallPromptEvent);
      };

      const handleAppInstalled = () => {
        setIsInstalled(true);
        setDeferredPrompt(null);
        if (onInstalled) onInstalled();
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.addEventListener('appinstalled', handleAppInstalled);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
      };
    }
  }, [onInstalled]);

  const handleInstallClick = async () => {
    if (isInstalled) return;

    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
          if (onInstalled) onInstalled();
        }
      } catch (err) {
        console.warn('Install prompt error:', err);
      }
    } else if (isIos) {
      setShowIosModal(true);
    } else {
      // Pour les navigateurs de bureau qui n'ont pas encore déclenché l'événement
      setShowIosModal(true);
    }
  };

  if (isInstalled) {
    if (variant === 'menu-item') {
      return (
        <div className="flex items-center justify-between p-2 rounded-lg text-xs text-stone-500 dark:text-stone-400 bg-stone-100/50 dark:bg-stone-800/40">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Application installée</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">Actif</span>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {variant === 'menu-item' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-amber-950 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/40 transition-all cursor-pointer ${className}`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-200/80 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100">
              <Download className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <span className="block leading-none">Installer l'application</span>
              <span className="text-[10px] text-amber-800/80 dark:text-amber-300/80 font-normal mt-0.5">
                Sur écran d'accueil mobile / desktop
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-800 text-white shrink-0">
            Installer
          </span>
        </button>
      ) : variant === 'nav' ? (
        <button
          type="button"
          onClick={handleInstallClick}
          title="Installer l'application sur votre écran d'accueil (Mobile ou Ordinateur)"
          className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-900 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-950/40 hover:bg-amber-200/80 dark:hover:bg-amber-900/60 border border-amber-300 dark:border-amber-800/60 rounded-lg shadow-2xs transition-all cursor-pointer whitespace-nowrap ${className}`}
        >
          <Download className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400" />
          <span>Installer</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white flex items-center gap-2 shadow-xs transition-all active:scale-98 cursor-pointer ${className}`}
        >
          <Download className="w-4 h-4" />
          <span>Installer l'application</span>
        </button>
      )}

      {/* Guide modal pour iOS Safari et navigateurs sans prompt direct */}
      {showIosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            role="dialog"
            aria-modal="true"
            className="bg-[#FBF9F5] dark:bg-[#1A1D24] border border-stone-300 dark:border-stone-700 shadow-2xl rounded-2xl w-full max-w-md p-5 text-stone-900 dark:text-stone-100 transition-colors"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 rounded-lg">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">
                  Installer Genealogor
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs text-stone-600 dark:text-stone-400">
              <p>
                L'application peut être ajoutée directement à l'écran d'accueil de votre téléphone, tablette ou ordinateur pour un accès instantané et plein écran :
              </p>

              {isIos ? (
                <div className="space-y-2 bg-white dark:bg-stone-900/60 p-3 rounded-xl border border-stone-200 dark:border-stone-800">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 flex items-center justify-center font-bold text-[10px]">
                      1
                    </span>
                    <span>Appuyez sur le bouton <strong>Partager</strong> <Share className="w-3.5 h-3.5 inline mx-1 text-sky-600" /> dans Safari.</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 flex items-center justify-center font-bold text-[10px]">
                      2
                    </span>
                    <span>Faites défiler et sélectionnez <strong>Sur l'écran d'accueil</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-stone-600" />.</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 flex items-center justify-center font-bold text-[10px]">
                      3
                    </span>
                    <span>Appuyez sur <strong>Ajouter</strong> en haut à droite.</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 bg-white dark:bg-stone-900/60 p-3 rounded-xl border border-stone-200 dark:border-stone-800">
                  <div className="flex items-center gap-2.5">
                    <Monitor className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>Sur ordinateur (Chrome / Edge) : cliquez sur l'icône <strong>Installer l'application</strong> située à droite dans la barre d'adresse de votre navigateur.</span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-stone-500 italic">
                L'application fonctionne également hors-ligne avec stockage local sécurisé.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowIosModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white cursor-pointer"
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
