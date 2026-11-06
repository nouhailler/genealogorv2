import React, { useState } from 'react';
import { X, Link2, Copy, Check, RefreshCw, Trash2, LogIn, Shield, AlertTriangle } from 'lucide-react';
import { ArchiveDocument } from '../types/genealogy';
import { PhotoShareRecord, buildPhotoShareUrl } from '../lib/photo-share';

export interface PhotoShareControls {
  /** Liens photo déjà créés sur cet appareil */
  records: PhotoShareRecord[];
  /** Crée (ou republie si `existing`) le lien d'une photo ; rejette avec un message en cas d'échec */
  onPublish: (archive: ArchiveDocument, hideLiving: boolean, existing?: PhotoShareRecord) => Promise<PhotoShareRecord>;
  onRevoke: (record: PhotoShareRecord) => Promise<void>;
  /** Connecté avec Google : condition pour publier dans Firestore */
  isCloudReady: boolean;
  onLogin?: () => void;
}

interface PhotoShareModalProps extends PhotoShareControls {
  archive: ArchiveDocument;
  onClose: () => void;
}

export const PhotoShareModal: React.FC<PhotoShareModalProps> = ({
  archive,
  onClose,
  records,
  onPublish,
  onRevoke,
  isCloudReady,
  onLogin,
}) => {
  const existing = records.find(r => r.archiveId === archive.id);
  const [hideLiving, setHideLiving] = useState(existing ? existing.hideLiving : true);
  const [busy, setBusy] = useState<null | 'publish' | 'revoke'>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const baseUrl = window.location.origin + window.location.pathname;
  const url = existing ? buildPhotoShareUrl(baseUrl, existing) : '';
  const tagCount = archive.photoTags?.length || 0;

  const publish = async () => {
    setBusy('publish');
    setError(null);
    try {
      await onPublish(archive, hideLiving, existing);
    } catch (e: any) {
      setError(e?.message || 'Publication impossible.');
    } finally {
      setBusy(null);
    }
  };

  const revoke = async () => {
    if (!existing) return;
    if (!confirm('Révoquer ce lien ? Les personnes qui l\'ont reçu ne pourront plus voir la photo.')) return;
    setBusy('revoke');
    setError(null);
    try {
      await onRevoke(existing);
    } catch (e: any) {
      setError(e?.message || 'Révocation impossible.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copie impossible : sélectionnez le lien et copiez-le manuellement.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-stone-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="photo-share-title"
        className="w-full max-w-md bg-white dark:bg-[#1A1D24] border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Link2 className="w-4 h-4" />
            </span>
            <div>
              <h2 id="photo-share-title" className="font-serif text-base font-bold text-stone-900 dark:text-stone-100">
                Partager cette photo
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 truncate max-w-[16rem]">{archive.title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
          Toute personne qui reçoit le lien voit la photo{' '}
          {tagCount === 0 ? '(aucune personne n\'est encore étiquetée)' : tagCount === 1 ? 'avec son étiquette numérotée' : `avec ses ${tagCount} étiquettes numérotées`},
          sans compte et en lecture seule. L'arbre n'est pas partagé. La photo est envoyée dans une version allégée et chiffrée ;
          la clé est dans le lien lui-même.
        </p>

        {!isCloudReady ? (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
            <p className="text-xs text-amber-900 dark:text-amber-300">
              Connectez-vous avec Google pour publier un lien de partage.
            </p>
            {onLogin && (
              <button
                type="button"
                onClick={onLogin}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg"
              >
                <LogIn className="w-3.5 h-3.5" /> Se connecter
              </button>
            )}
          </div>
        ) : (
          <>
            <label className="flex items-start gap-2 text-xs text-stone-700 dark:text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hideLiving}
                onChange={e => setHideLiving(e.target.checked)}
                className="mt-0.5 accent-amber-800"
              />
              <span>
                <span className="font-semibold inline-flex items-center gap-1"><Shield className="w-3 h-3" /> Masquer les personnes vivantes</span>
                <span className="block text-stone-500 dark:text-stone-400">
                  Leur repère reste visible, avec « Personne vivante » à la place du nom.
                </span>
              </span>
            </label>

            {existing && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    readOnly
                    value={url}
                    onFocus={e => e.currentTarget.select()}
                    aria-label="Lien de partage de la photo"
                    className="flex-1 min-w-0 text-[11px] font-mono bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg px-2 py-1.5 text-stone-800 dark:text-stone-200"
                  />
                  <button
                    type="button"
                    onClick={copy}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shrink-0"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copié' : 'Copier'}
                  </button>
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Publié le {new Date(existing.updatedAt).toLocaleString('fr-FR')}. Le lien montre la photo telle qu'à cette date :
                  après avoir ajouté ou modifié des étiquettes, cliquez sur « Mettre à jour ».
                </p>
              </div>
            )}

            {error && (
              <p className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              {existing ? (
                <button
                  type="button"
                  onClick={revoke}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {busy === 'revoke' ? 'Révocation…' : 'Révoquer'}
                </button>
              ) : <span />}
              <button
                type="button"
                onClick={publish}
                disabled={busy !== null}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shadow-sm disabled:opacity-50"
              >
                {existing ? <RefreshCw className={`w-3.5 h-3.5 ${busy === 'publish' ? 'animate-spin' : ''}`} /> : <Link2 className="w-3.5 h-3.5" />}
                {busy === 'publish' ? 'Publication…' : existing ? 'Mettre à jour' : 'Créer le lien'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
