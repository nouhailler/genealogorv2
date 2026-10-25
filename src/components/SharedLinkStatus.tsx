import React from 'react';
import { RotateCcw, Link2Off, KeyRound, AlertTriangle } from 'lucide-react';
import { Logo } from './Logo';

interface SharedLinkStatusProps {
  status: 'loading' | 'missing' | 'no-key' | 'error';
  message?: string;
}

const CONTENT = {
  loading: {
    icon: RotateCcw,
    title: 'Ouverture de l\'arbre partagé…',
    text: 'Récupération et déchiffrement de la copie partagée.',
  },
  missing: {
    icon: Link2Off,
    title: 'Lien de partage introuvable',
    text: 'Ce lien a été révoqué par le créateur de l\'arbre, ou il est incomplet. Demandez-lui un nouveau lien.',
  },
  'no-key': {
    icon: KeyRound,
    title: 'Lien incomplet',
    text: 'La clé de déchiffrement (partie « #k=… » à la fin du lien) est absente. Copiez le lien en entier depuis le message reçu.',
  },
  error: {
    icon: AlertTriangle,
    title: 'Impossible d\'ouvrir cet arbre',
    text: 'Le lien semble modifié ou incomplet.',
  },
};

/** Écran affiché à la place de l'application tant qu'un lien de partage n'est pas ouvert */
export const SharedLinkStatus: React.FC<SharedLinkStatusProps> = ({ status, message }) => {
  const { icon: Icon, title, text } = CONTENT[status];
  return (
    <div className="min-h-screen bg-[#FBF9F5] dark:bg-[#121418] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-[#1A1D24] border border-stone-200 dark:border-stone-800 rounded-2xl p-8 text-center space-y-4 shadow-sm">
        <div className="flex justify-center">
          <Logo size="sm" showText={true} />
        </div>
        <div className="w-12 h-12 mx-auto rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 flex items-center justify-center">
          <Icon className={`w-6 h-6 ${status === 'loading' ? 'animate-spin' : ''}`} />
        </div>
        <h1 className="font-serif text-xl font-bold text-stone-900 dark:text-stone-100">{title}</h1>
        <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed">{message || text}</p>
        {status !== 'loading' && (
          <a
            href={window.location.pathname}
            className="inline-block text-xs font-semibold text-amber-800 dark:text-amber-400 hover:underline"
          >
            Ouvrir Genealogor →
          </a>
        )}
      </div>
    </div>
  );
};
