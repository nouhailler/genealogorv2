import React, { useState } from 'react';
import { X, Lock, Link, Copy, Check, Shield, Users, Eye, Edit3, Trash2, Key } from 'lucide-react';
import { BranchAccess, BranchRole, BranchScope, GenealogyData } from '../types/genealogy';
import { hashPassword } from '../lib/crypto';


interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: GenealogyData;
  roomId: string;
  accessList: BranchAccess[];
  onAddAccess: (access: BranchAccess) => void;
  onDeleteAccess: (id: string) => void;
  rootPersonId: string;
  userRole?: BranchRole;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  data,
  roomId,
  accessList,
  onAddAccess,
  onDeleteAccess,
  rootPersonId,
  userRole = 'viewer',
}) => {
  const [branch, setBranch] = useState<BranchScope>('paternal');
  const [role, setRole] = useState<BranchRole>('viewer');
  const [accessName, setAccessName] = useState('');
  const [password, setPassword] = useState('');
  const [hideLiving, setHideLiving] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedQuickReader, setCopiedQuickReader] = useState(false);

  if (!isOpen) return null;

  const rootPerson = data.individuals[rootPersonId];

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'admin') return;
    const defaultName = branch === 'paternal' 
      ? 'Branche Paternelle (Cousins côté père)' 
      : branch === 'maternal' 
        ? 'Branche Maternelle (Cousins côté mère)' 
        : 'Famille Élargie (Arbre complet)';

    // Jeton d'invitation unique vérifié côté serveur
    const token = 'inv-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 12);

    let pwdHash = '';
    if (password.trim()) {
      pwdHash = await hashPassword(password.trim());
    }

    const newAccess: BranchAccess = {
      id: 'acc-' + Date.now(),
      name: accessName.trim() || defaultName,
      branch,
      rootPersonId,
      role,
      passwordHash: pwdHash || undefined,
      hideLiving,
      shareToken: token,
      createdAt: Date.now(),
    };

    onAddAccess(newAccess);
    setAccessName('');
    setPassword('');
  };

  const getShareUrl = (access: BranchAccess) => {
    if (typeof window === 'undefined') return '';
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    params.set('room', roomId);
    params.set('token', access.shareToken);
    params.set('branch', access.branch);
    params.set('role', access.role);
    return `${base}?${params.toString()}`;
  };

  const getDirectReaderUrl = () => {
    if (typeof window === 'undefined') return '';
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams();
    params.set('room', roomId);
    params.set('role', 'viewer');
    return `${base}?${params.toString()}`;
  };

  const copyQuickReaderUrl = () => {
    const url = getDirectReaderUrl();
    navigator.clipboard.writeText(url);
    setCopiedQuickReader(true);
    setTimeout(() => setCopiedQuickReader(false), 2500);
  };

  const copyToClipboard = (access: BranchAccess) => {
    const url = getShareUrl(access);
    navigator.clipboard.writeText(url);
    setCopiedId(access.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#FBF9F5] border border-stone-300 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200/80 bg-stone-100/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-900 rounded-lg">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-stone-900">
                Partager l'Arbre & Gestion des Accès
              </h2>
              <p className="text-xs text-stone-600">
                Créez des liens privés sécurisés par mot de passe et restreints par branche
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Section Profils & Règle d'accès par défaut */}
          <div className="p-4 bg-amber-50/80 border border-amber-200/90 rounded-xl space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-amber-800" />
                    <span>Partage Express — Profil Lecteur (par défaut)</span>
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900 font-bold">
                    Recommandé
                  </span>
                </div>
                <p className="text-xs text-stone-700 leading-relaxed">
                  Lorsque vous partagez votre arbre avec des membres de la famille, le destinataire reçoit <strong>par défaut le Profil Lecteur</strong> (consultation de l'arbre). <strong>En aucun cas le profil lecteur ne peut créer un arbre</strong> ni altérer les données existantes.
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={copyQuickReaderUrl}
                className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer ${
                  copiedQuickReader
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-900 hover:bg-amber-950 text-white'
                }`}
              >
                {copiedQuickReader ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Lien Lecteur copié !</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copier le lien direct de consultation (Profil Lecteur)</span>
                  </>
                )}
              </button>
              <span className="text-[11px] font-mono text-stone-500 truncate">
                ?room={roomId}&role=viewer
              </span>
            </div>
          </div>

          {userRole !== 'admin' ? (
            <div className="p-4 bg-stone-100/90 border border-stone-200 rounded-xl text-xs text-stone-700 flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-stone-500 shrink-0" />
              <span>
                Vous consultez cet arbre en tant que <strong>Profil Lecteur</strong>. Seul le profil créateur / administrateur peut configurer des mots de passe personnalisés ou révoquer les accès.
              </span>
            </div>
          ) : (
            /* Nouveau lien de partage form pour administrateur */
            <form onSubmit={handleCreateLink} className="p-4 bg-white border border-stone-200 rounded-xl space-y-4 shadow-2xs">
              <h3 className="text-sm font-semibold text-stone-800 flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-700" />
                <span>Générer un lien privé avec mot de passe ou restriction de branche</span>
              </h3>

              {/* Choix de la branche */}
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5">
                  Branche accessible via ce lien
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setBranch('paternal')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border text-left transition-all ${
                      branch === 'paternal'
                        ? 'border-amber-700 bg-amber-50 text-amber-950 font-semibold ring-1 ring-amber-700'
                        : 'border-stone-200 bg-stone-50/50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <span className="block font-medium">Branche Paternelle</span>
                    <span className="text-[10px] text-stone-500">Côté père uniquement</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBranch('maternal')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border text-left transition-all ${
                      branch === 'maternal'
                        ? 'border-amber-700 bg-amber-50 text-amber-950 font-semibold ring-1 ring-amber-700'
                        : 'border-stone-200 bg-stone-50/50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <span className="block font-medium">Branche Maternelle</span>
                    <span className="text-[10px] text-stone-500">Côté mère uniquement</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBranch('all')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border text-left transition-all ${
                      branch === 'all'
                        ? 'border-amber-700 bg-amber-50 text-amber-950 font-semibold ring-1 ring-amber-700'
                        : 'border-stone-200 bg-stone-50/50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <span className="block font-medium">Arbre Complet</span>
                    <span className="text-[10px] text-stone-500">Toutes les lignées</span>
                  </button>
                </div>
              </div>

              {/* Rôle & permissions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Profil attribué au destinataire
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as BranchRole)}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-700"
                  >
                    <option value="viewer">Profil Lecteur (par défaut — consultation seule, création d'arbre interdite)</option>
                    <option value="editor">Profil Éditeur (modifications de données, création interdite)</option>
                    <option value="admin">Profil Administrateur / Créateur (gestion complète et création)</option>
                  </select>
                </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Mot de passe commun de la branche (Optionnel mais recommandé)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ex: MartinCancale1742"
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg pl-8 pr-3 p-2 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-700"
                  />
                  <Lock className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>

            {/* Nom & Option confidentialité */}
            <div className="space-y-2">
              <input
                type="text"
                value={accessName}
                onChange={(e) => setAccessName(e.target.value)}
                placeholder="Libellé du lien (ex: Cousins de Normandie)"
                className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-700"
              />

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideLiving}
                  onChange={(e) => setHideLiving(e.target.checked)}
                  className="rounded text-amber-800 focus:ring-amber-700 h-3.5 w-3.5"
                />
                <span className="text-xs text-stone-600">
                  Masquer les personnes vivantes (&lt; 100 ans) pour protéger la vie privée
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full py-2 px-4 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shadow-sm transition-all"
            >
              Créer le lien sécurisé
            </button>
          </form>
          )}

          {/* Liste des liens existants */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Liens d'accès actifs ({accessList.length})
            </h3>

            {accessList.length === 0 ? (
              <div className="p-6 text-center text-xs text-stone-500 bg-stone-100/50 rounded-xl border border-dashed border-stone-200">
                Aucun lien de branche créé pour l'instant. Utilisez le formulaire ci-dessus pour inviter des membres de la famille.
              </div>
            ) : (
              <div className="space-y-2.5">
                {accessList.map((access) => {
                  const url = getShareUrl(access);
                  return (
                    <div
                      key={access.id}
                      className="p-3.5 bg-white border border-stone-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-stone-900">{access.name}</span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                            {access.branch === 'paternal' ? 'Branche Paternelle' : access.branch === 'maternal' ? 'Branche Maternelle' : 'Arbre complet'}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/50">
                            {access.role === 'editor' ? 'Éditeur' : access.role === 'admin' ? 'Admin' : 'Lecteur'}
                          </span>
                        </div>

                        <div className="text-[11px] text-stone-500 flex items-center gap-2">
                          {access.password && (
                            <span className="flex items-center gap-1 font-mono text-stone-700">
                              <Lock className="w-3 h-3 text-amber-700" />
                              <span>Code: {access.password}</span>
                            </span>
                          )}
                          <span>·</span>
                          <span>{access.hideLiving ? 'Vivants masqués' : 'Données complètes'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => copyToClipboard(access)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                            copiedId === access.id
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-stone-100 hover:bg-stone-200 text-stone-800'
                          }`}
                        >
                          {copiedId === access.id ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Lien copié !</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copier le lien</span>
                            </>
                          )}
                        </button>

                        {userRole === 'admin' && (
                          <button
                            onClick={() => onDeleteAccess(access.id)}
                            title="Révoquer l'accès"
                            className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-200/80 bg-stone-100/60 flex items-center justify-between text-xs text-stone-500">
          <span>Salon temps réel : <strong className="font-mono text-stone-700">{roomId}</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-medium text-stone-700 hover:bg-stone-200/60 rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
