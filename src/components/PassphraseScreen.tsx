import React, { useState } from 'react';
import { Lock, Shield, ArrowRight, Key, AlertCircle } from 'lucide-react';

interface PassphraseScreenProps {
  branchName: string;
  onUnlock: (password: string) => Promise<boolean>;
  onContinueAsGuest?: () => void;
}

export const PassphraseScreen: React.FC<PassphraseScreenProps> = ({
  branchName,
  onUnlock,
  onContinueAsGuest,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Veuillez saisir le mot de passe d\'accès familial.');
      return;
    }

    setIsLoading(true);
    setError('');

    const success = await onUnlock(password.trim());
    setIsLoading(false);

    if (!success) {
      setError('Mot de passe incorrect pour cette branche. Veuillez vérifier auprès de votre famille.');
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F5] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-stone-200 shadow-xl rounded-2xl p-8 space-y-6 text-center animate-in fade-in duration-300">
        
        {/* Sceau / Insigne */}
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 border border-amber-200/80 text-amber-900 flex items-center justify-center shadow-xs">
          <Shield className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] uppercase font-mono tracking-widest text-stone-500 block">
            ACCÈS FAMILIAL PRIVÉ & SÉCURISÉ
          </span>
          <h1 className="font-serif text-2xl font-bold text-stone-900">
            {branchName || 'Arbre Généalogique Partagé'}
          </h1>
          <p className="text-xs text-stone-600">
            Cet arbre est protégé par chiffrement. Veuillez saisir le mot de passe de branche communiqué par l'administrateur.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative text-left">
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Mot de passe de la branche
            </label>
            <div className="relative">
              <input
                type="password"
                required
                autoFocus
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="Saisissez le mot de passe..."
                className="w-full text-sm bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-800"
              />
              <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs text-left">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 active:scale-98 shadow-sm transition-all disabled:opacity-50"
          >
            <span>{isLoading ? 'Vérification...' : 'Déverrouiller l\'arbre'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="pt-4 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
          <span>Chiffrement de bout en bout</span>
          {onContinueAsGuest && (
            <button
              onClick={onContinueAsGuest}
              className="text-stone-600 hover:text-amber-900 underline"
            >
              Mode découverte
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
