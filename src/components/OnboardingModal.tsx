import React, { useState } from 'react';
import { 
  ShieldAlert, ShieldCheck, Check, Sparkles, BookOpen, 
  GitFork, Share2, Download, ArrowRight, X 
} from 'lucide-react';
import { Logo } from './Logo';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDismissable?: boolean;
}

export const ONBOARDING_ACCEPTED_KEY = 'genealogor_onboarding_accepted';

export function hasAcceptedOnboarding(): boolean {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(ONBOARDING_ACCEPTED_KEY) === 'true';
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  isDismissable = true,
}) => {
  const [hasScrolledDisclaimer, setHasScrolledDisclaimer] = useState(false);
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false);

  if (!isOpen) return null;

  const handleAccept = () => {
    try {
      localStorage.setItem(ONBOARDING_ACCEPTED_KEY, 'true');
    } catch (e) {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="bg-[#FBF9F5] dark:bg-[#1A1D24] border border-stone-300 dark:border-stone-700 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100 transition-colors"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200/80 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/50">
          <Logo size="md" showText={true} />
          {isDismissable && (
            <button
              onClick={onClose}
              className="p-1.5 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 rounded-lg hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              title="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">
          
          {/* Welcome note */}
          <div>
            <h2 id="onboarding-title" className="font-serif text-2xl font-bold text-amber-950 dark:text-amber-300 mb-1">
              Bienvenue sur Genealogor
            </h2>
            <p className="text-stone-600 dark:text-stone-400">
              Votre atelier d'histoire familiale privée, studio d'archives manuscrites et espace de collaboration sécurisé entre proches.
            </p>
          </div>

          {/* Key pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 rounded-xl">
              <div className="w-7 h-7 rounded-lg bg-amber-200/70 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 flex items-center justify-center mb-2">
                <GitFork className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-xs text-amber-950 dark:text-amber-200 mb-0.5">Arbre & Multi-vues</h3>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                Ascendance Sosa-Stradonitz, descendance, chronologie historique et dispersion géographique.
              </p>
            </div>

            <div className="p-3.5 bg-stone-50 dark:bg-stone-800/40 border border-stone-200 dark:border-stone-700/60 rounded-xl">
              <div className="w-7 h-7 rounded-lg bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-center mb-2">
                <BookOpen className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-xs text-stone-900 dark:text-stone-200 mb-0.5">Studio & Marquage</h3>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                Transcription paléographique, filtres d'actes et repères interactifs de visages sur photos anciennes.
              </p>
            </div>

            <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/40 rounded-xl">
              <div className="w-7 h-7 rounded-lg bg-emerald-200/70 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-200 flex items-center justify-center mb-2">
                <Share2 className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-xs text-emerald-950 dark:text-emerald-200 mb-0.5">Partage par Branche</h3>
              <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                Liens privés protégés par mot de passe avec masquage strict des contemporains vivants.
              </p>
            </div>
          </div>

          {/* MENTIONS LÉGALES & AVERTISSEMENT DE NON-RESPONSABILITÉ OBLIGATOIRE */}
          <div className="p-4 bg-rose-50/70 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-800/50 rounded-xl">
            <div className="flex items-center gap-2 text-rose-900 dark:text-rose-300 font-bold text-xs uppercase tracking-wider mb-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>Mentions Légales & Avertissement de Non-Responsabilité</span>
            </div>
            
            <div 
              onScroll={() => setHasScrolledDisclaimer(true)}
              className="text-xs text-rose-950/90 dark:text-rose-200/90 space-y-2 bg-white/70 dark:bg-stone-900/60 p-3 rounded-lg border border-rose-200 dark:border-rose-900/40 max-h-36 overflow-y-auto leading-relaxed"
            >
              <p className="font-semibold">
                1. Exonération totale de responsabilité quant aux données :
              </p>
              <p>
                L'éditeur, le concepteur et les développeurs de la plateforme logicielle <strong>Genealogor</strong> ne sauraient en aucun cas être tenus responsables de l'exactitude, de la complétude, de l'authenticité, de la légalité, du respect du droit à l'image, des droits d'auteur ou de toute conséquence découlant des données généalogiques, filiations, photographies, actes, annotations et documents d'archives fournis, saisis, téléversés ou partagés par les utilisateurs.
              </p>
              <p className="font-semibold">
                2. Responsabilité exclusive de l'utilisateur :
              </p>
              <p>
                Chaque utilisateur est seul et unique responsable éditorial et civil des informations qu'il enregistre, importe (fichiers GEDCOM, images, archives) et des autorisations d'accès qu'il concède à des tiers via les liens de partage.
              </p>
              <p className="font-semibold">
                3. Absence de valeur juridique ou d'état civil officiel :
              </p>
              <p>
                Genealogor est un outil technique d'organisation privée et de recherche personnelle. Les arbres et documents constitués n'ont aucune valeur d'acte notarié ni de certificat d'état civil officiel.
              </p>
              <p className="font-semibold">
                4. Protection des personnes vivantes :
              </p>
              <p>
                Il incombe aux utilisateurs de veiller au respect de la vie privée de leurs proches et d'activer les options de protection des contemporains vivants prévues par l'application.
              </p>
            </div>

            <label className="mt-3.5 flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acceptedDisclaimer}
                onChange={(e) => setAcceptedDisclaimer(e.target.checked)}
                className="mt-0.5 rounded border-rose-300 text-rose-800 focus:ring-rose-700 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs text-rose-950 dark:text-rose-300 font-medium">
                Je reconnais avoir pris connaissance de ces mentions légales et accepte que l'éditeur et les développeurs ne soient en aucun cas responsables des données et contenus fournis dans l'application.
              </span>
            </label>
          </div>

        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-stone-200 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Données stockées localement & chiffrement client</span>
          </div>

          <button
            type="button"
            disabled={!acceptedDisclaimer}
            onClick={handleAccept}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-xs tracking-wide flex items-center justify-center gap-2 transition-all cursor-pointer ${
              acceptedDisclaimer
                ? 'bg-amber-900 hover:bg-amber-950 text-white shadow-sm active:scale-98'
                : 'bg-stone-300 dark:bg-stone-800 text-stone-500 dark:text-stone-500 cursor-not-allowed'
            }`}
          >
            <span>Commencer l'exploration</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
