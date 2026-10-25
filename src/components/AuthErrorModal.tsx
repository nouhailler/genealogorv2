import React, { useState } from 'react';
import { ShieldAlert, ExternalLink, Copy, Check, RefreshCw, X, ArrowRight } from 'lucide-react';
import { loginWithGoogleRedirect, loginWithGoogle } from '../lib/firebase';

export interface AuthErrorInfo {
  code: string;
  message: string;
  currentDomain: string;
  firebaseProjectId: string;
}

interface AuthErrorModalProps {
  errorInfo: AuthErrorInfo;
  onClose: () => void;
  onSuccess: () => void;
}

export const AuthErrorModal: React.FC<AuthErrorModalProps> = ({
  errorInfo,
  onClose,
  onSuccess,
}) => {
  const [copied, setCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const isUnauthorizedDomain = errorInfo.code === 'auth/unauthorized-domain';
  const isPopupBlocked = errorInfo.code === 'auth/popup-blocked';

  const copyDomain = () => {
    navigator.clipboard.writeText(errorInfo.currentDomain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRetryPopup = async () => {
    setIsRetrying(true);
    try {
      const user = await loginWithGoogle();
      if (user) {
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      console.error('Retry failed:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRedirectLogin = async () => {
    try {
      await loginWithGoogleRedirect();
    } catch (err) {
      console.error('Redirect failed:', err);
    }
  };

  const firebaseSettingsUrl = `https://console.firebase.google.com/project/${errorInfo.firebaseProjectId}/authentication/settings`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#FAF8F5] border border-amber-900/20 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-stone-800">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-full transition-colors"
          title="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-100/80 border border-amber-300 text-amber-900 rounded-xl shrink-0 mt-0.5">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-stone-900">
              {isUnauthorizedDomain
                ? 'Domaine non autorisé dans Firebase'
                : isPopupBlocked
                ? 'Fenêtre pop-up bloquée'
                : 'Erreur d’authentification Google'}
            </h3>
            <p className="text-xs font-mono text-stone-500 mt-0.5">
              Code : {errorInfo.code}
            </p>
          </div>
        </div>

        {isUnauthorizedDomain ? (
          <div className="mt-4 space-y-4 text-sm text-stone-700 leading-relaxed">
            <p>
              Pour des raisons de sécurité, Firebase bloque la connexion Google depuis les domaines qui n'ont pas encore été autorisés dans la console du projet.
            </p>

            <div className="bg-white border border-stone-200 rounded-xl p-3.5 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 block">
                Domaine à ajouter :
              </span>
              <div className="flex items-center justify-between gap-2 bg-stone-50 border border-stone-200/80 rounded-lg px-3 py-2">
                <code className="font-mono text-sm font-bold text-amber-950">
                  {errorInfo.currentDomain}
                </code>
                <button
                  onClick={copyDomain}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 rounded shadow-2xs transition-all active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-semibold">Copié</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-stone-500" />
                      <span>Copier</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2 text-xs text-stone-600 bg-amber-50/70 border border-amber-200/60 p-3.5 rounded-xl">
              <p className="font-semibold text-amber-950">Étapes pour autoriser le domaine (1 minute) :</p>
              <ol className="list-decimal list-inside space-y-1 pl-1">
                <li>Ouvrez les paramètres d'authentification du projet Firebase.</li>
                <li>Faites défiler jusqu'à la section <strong>« Domaines autorisés »</strong>.</li>
                <li>Cliquez sur <strong>« Ajouter un domaine »</strong> et collez <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">{errorInfo.currentDomain}</code>.</li>
                <li>Cliquez sur <strong>Enregistrer</strong>.</li>
              </ol>
              <p className="text-[11px] text-amber-800 italic pt-1">
                ✓ L'activation est immédiate sans avoir besoin de recompiler ou redéployer votre site Cloudflare.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
              <a
                href={firebaseSettingsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-xl shadow-xs transition-colors text-center"
              >
                <span>Ouvrir la Console Firebase</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={handleRetryPopup}
                disabled={isRetrying}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-100 border border-stone-300 rounded-xl shadow-2xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>Réessayer</span>
              </button>
            </div>
          </div>
        ) : isPopupBlocked ? (
          <div className="mt-4 space-y-4 text-sm text-stone-700 leading-relaxed">
            <p>
              Le navigateur a bloqué l'ouverture automatique de la fenêtre pop-up Google. Vous pouvez autoriser les pop-ups pour ce site, ou utiliser la connexion par redirection ci-dessous.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={handleRedirectLogin}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-xl shadow-xs transition-colors"
              >
                <span>Connexion par redirection</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRetryPopup}
                disabled={isRetrying}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-stone-700 bg-white hover:bg-stone-100 border border-stone-300 rounded-xl shadow-2xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>Réessayer la pop-up</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4 text-sm text-stone-700 leading-relaxed">
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-mono break-words">
              {errorInfo.message}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 rounded-xl transition-colors"
              >
                Fermer
              </button>
              <button
                onClick={handleRetryPopup}
                disabled={isRetrying}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-xl transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>Réessayer</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
