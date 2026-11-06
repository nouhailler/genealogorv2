import React, { useEffect, useRef, useState } from 'react';
import { Calendar, MapPin, Eye, EyeOff, UserPlus, Send, Pencil, Trash2, CheckCircle2, X, Loader2 } from 'lucide-react';
import { Logo } from './Logo';
import { PhotoShareSnapshot, LIVING_PLACEHOLDER } from '../lib/photo-share';
import { ProposalItem, ProposalSubmission, PROPOSAL_LIMITS } from '../lib/photo-proposals';

interface SharedPhotoViewProps {
  snapshot: PhotoShareSnapshot;
  /** Envoi des propositions d'identification à l'administrateur ; absent = fonction indisponible */
  onSubmitProposals?: (submission: ProposalSubmission) => Promise<void>;
}

type Draft = { index: number | null; x: number; y: number; name: string; details: string };

/** Placement d'une bulle sous le repère (au-dessus tout en bas), alignée sur le bord près des côtés */
const bubblePlacement = (x: number, y: number, bottomLimit = 88) =>
  `${y > bottomLimit ? 'bottom-full mb-2' : 'top-full mt-2'} ${x < 25 ? 'left-0' : x > 75 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`;

/** Page publique d'un lien photo : l'image, ses repères numérotés, la légende, et les propositions d'identification */
export const SharedPhotoView: React.FC<SharedPhotoViewProps> = ({ snapshot, onSubmitProposals }) => {
  const [activeN, setActiveN] = useState<number | null>(null);
  const [showPins, setShowPins] = useState(true);
  const { title, date, place, image, tags, generatedAt } = snapshot;

  // Propositions du visiteur
  const [proposing, setProposing] = useState(false);
  const [items, setItems] = useState<ProposalItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [proposer, setProposer] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draft) nameRef.current?.focus();
  }, [draft?.index, draft?.x, draft?.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDraft(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!proposing || !imgRef.current) return;
    if (items.length >= PROPOSAL_LIMITS.MAX_ITEMS) {
      setSendError(`${PROPOSAL_LIMITS.MAX_ITEMS} propositions au plus par envoi : envoyez celles-ci d'abord.`);
      return;
    }
    const r = imgRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 10000) / 100;
    const y = Math.round(((e.clientY - r.top) / r.height) * 10000) / 100;
    setDraft({ index: null, x, y, name: '', details: '' });
  };

  const saveDraft = () => {
    if (!draft || !draft.name.trim()) return;
    const item: ProposalItem = {
      x: draft.x, y: draft.y,
      name: draft.name.trim().slice(0, PROPOSAL_LIMITS.NAME),
      ...(draft.details.trim() ? { details: draft.details.trim().slice(0, PROPOSAL_LIMITS.DETAILS) } : {}),
    };
    setItems(prev => (draft.index === null ? [...prev, item] : prev.map((it, i) => (i === draft.index ? item : it))));
    setDraft(null);
    setSendError(null);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    setDraft(null);
  };

  const send = async () => {
    if (!onSubmitProposals || items.length === 0) return;
    setSending(true);
    setSendError(null);
    try {
      await onSubmitProposals({ items, ...(proposer.trim() ? { proposer: proposer.trim() } : {}), ...(comment.trim() ? { comment: comment.trim() } : {}) });
      setSentCount(items.length);
      setItems([]);
      setComment('');
      setProposing(false);
    } catch (e: any) {
      setSendError(e?.message || 'Envoi impossible. Réessayez plus tard.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F5] dark:bg-[#121418] text-stone-900 dark:text-stone-100">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-[#1A1D24]/80">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Logo size="sm" showText={true} />
          <span className="text-[11px] text-stone-500 dark:text-stone-400">Photo partagée{onSubmitProposals ? '' : ' · lecture seule'}</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-bold">{title}</h1>
          {(date || place) && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600 dark:text-stone-400">
              {date && <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{date}</span>}
              {place && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{place}</span>}
            </p>
          )}
        </div>

        {onSubmitProposals && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setProposing(p => !p); setDraft(null); setSentCount(null); setSendError(null); }}
              aria-pressed={proposing}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border shadow-sm cursor-pointer ${
                proposing
                  ? 'bg-amber-900 text-white border-amber-900'
                  : 'bg-white dark:bg-[#1A1D24] text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              {proposing ? 'Terminer' : 'Proposer une identification'}
            </button>
            {proposing && (
              <span className="text-xs text-stone-600 dark:text-stone-400">
                Cliquez sur un visage que vous reconnaissez, puis indiquez qui c'est.
              </span>
            )}
          </div>
        )}

        {sentCount !== null && (
          <div role="status" className="flex items-start gap-2 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-sm text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Merci ! {sentCount > 1 ? `Vos ${sentCount} propositions ont été envoyées` : 'Votre proposition a été envoyée'} à l'administrateur de l'arbre,
              qui les examinera une à une. Les identifications validées apparaîtront sur cette page.
            </span>
          </div>
        )}

        <div className="bg-stone-900 rounded-2xl p-2 sm:p-3 flex justify-center">
          <div className="relative inline-block max-w-full">
            <img
              ref={imgRef}
              src={image}
              alt={title}
              onClick={handleImageClick}
              className={`block max-w-full max-h-[75vh] w-auto h-auto rounded-lg select-none ${proposing ? 'cursor-crosshair ring-2 ring-amber-500' : ''}`}
              draggable={false}
            />
            {showPins && tags.map(tag => {
              const active = activeN === tag.n;
              return (
                <button
                  key={tag.n}
                  type="button"
                  style={{ left: `${tag.x}%`, top: `${tag.y}%` }}
                  onMouseEnter={() => setActiveN(tag.n)}
                  onMouseLeave={() => setActiveN(null)}
                  onFocus={() => setActiveN(tag.n)}
                  onBlur={() => setActiveN(null)}
                  onClick={() => {
                    setActiveN(tag.n);
                    document.getElementById(`photo-tag-${tag.n}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }}
                  aria-label={`${tag.n}. ${tag.name}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full shadow-lg transition-transform ${
                    active
                      ? 'scale-125 z-20 bg-amber-900 text-white ring-2 ring-amber-400'
                      : 'z-10 bg-stone-900/80 text-amber-200 border-2 border-amber-300/80'
                  }`}
                >
                  <span className="text-[10px] sm:text-[11px] font-bold font-mono">{tag.n}</span>
                  {active && (
                    // Sous le repère pour ne pas masquer le visage ; au-dessus seulement tout en bas de l'image
                    <span className={`absolute ${bubblePlacement(tag.x, tag.y)} max-w-[60vw] truncate whitespace-nowrap px-2 py-1 rounded-md bg-white text-stone-900 text-xs font-semibold shadow-lg pointer-events-none`}>
                      {tag.name}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Propositions en cours (pointillés) */}
            {items.map((it, i) => (
              <button
                key={`p${i}`}
                type="button"
                style={{ left: `${it.x}%`, top: `${it.y}%` }}
                onClick={() => proposing && setDraft({ index: i, x: it.x, y: it.y, name: it.name, details: it.details || '' })}
                aria-label={`Proposition ${i + 1} : ${it.name}`}
                title={it.name}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full border-2 border-dashed border-amber-400 bg-amber-50/90 text-amber-900 shadow-lg"
              >
                <span className="text-[9px] sm:text-[10px] font-bold font-mono">P{i + 1}</span>
              </button>
            ))}

            {/* Fiche de saisie sur le visage cliqué */}
            {draft && (
              <div
                style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
                className="absolute z-30 w-0 h-0"
              >
                <span className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-dashed border-amber-500 bg-amber-200/70 animate-pulse" />
                <form
                  onSubmit={e => { e.preventDefault(); saveDraft(); }}
                  onClick={e => e.stopPropagation()}
                  className={`absolute ${bubblePlacement(draft.x, draft.y, 70)} w-64 max-w-[80vw] p-3 rounded-xl bg-white dark:bg-[#1A1D24] text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-700 shadow-2xl space-y-2 text-left`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{draft.index === null ? 'Qui est-ce ?' : `Proposition P${draft.index + 1}`}</span>
                    <button type="button" onClick={() => setDraft(null)} aria-label="Annuler" className="p-0.5 text-stone-400 hover:text-stone-700">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    ref={nameRef}
                    value={draft.name}
                    onChange={e => setDraft({ ...draft, name: e.target.value })}
                    maxLength={PROPOSAL_LIMITS.NAME}
                    placeholder="Prénom et nom (ex. Jeannot Coste)"
                    aria-label="Nom de la personne"
                    className="w-full text-xs bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-700"
                  />
                  <input
                    value={draft.details}
                    onChange={e => setDraft({ ...draft, details: e.target.value })}
                    maxLength={PROPOSAL_LIMITS.DETAILS}
                    placeholder="Précision (facultatif) : années, lien de parenté…"
                    aria-label="Précision"
                    className="w-full text-xs bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-700"
                  />
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {draft.index !== null ? (
                      <button type="button" onClick={() => removeItem(draft.index!)} className="inline-flex items-center gap-1 text-[11px] text-rose-700 hover:underline">
                        <Trash2 className="w-3 h-3" /> Retirer
                      </button>
                    ) : <span />}
                    <button
                      type="submit"
                      disabled={!draft.name.trim()}
                      className="px-3 py-1 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg disabled:opacity-40"
                    >
                      {draft.index === null ? 'Ajouter' : 'Enregistrer'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Récapitulatif et envoi */}
        {onSubmitProposals && items.length > 0 && (
          <section className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 rounded-2xl p-4 sm:p-5 space-y-3">
            <h2 className="font-serif text-lg font-bold">Vos propositions ({items.length})</h2>
            <ol className="space-y-1.5">
              {items.map((it, i) => (
                <li key={i} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-white dark:bg-[#1A1D24] border border-amber-100 dark:border-amber-900/40">
                  <span className="flex items-start gap-2 min-w-0">
                    <span className="w-7 h-6 shrink-0 rounded-full border-2 border-dashed border-amber-400 text-amber-900 dark:text-amber-300 text-[10px] font-bold font-mono flex items-center justify-center">P{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold break-words">{it.name}</span>
                      {it.details && <span className="block text-xs text-stone-600 dark:text-stone-400 break-words">{it.details}</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => { setProposing(true); setDraft({ index: i, x: it.x, y: it.y, name: it.name, details: it.details || '' }); }} aria-label={`Modifier P${i + 1}`} className="p-1 text-stone-500 hover:text-stone-800">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => removeItem(i)} aria-label={`Retirer P${i + 1}`} className="p-1 text-stone-500 hover:text-rose-700">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={proposer}
                onChange={e => setProposer(e.target.value)}
                maxLength={PROPOSAL_LIMITS.PROPOSER}
                placeholder="Votre prénom (facultatif)"
                aria-label="Votre prénom"
                className="text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                maxLength={PROPOSAL_LIMITS.COMMENT}
                placeholder="Un mot pour l'administrateur (facultatif)"
                aria-label="Commentaire"
                className="text-xs bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            {sendError && <p role="alert" className="text-xs text-rose-700 dark:text-rose-400">{sendError}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-stone-600 dark:text-stone-400">
                L'administrateur de l'arbre validera chaque proposition avant qu'elle n'apparaisse. Vos propositions sont chiffrées.
              </p>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shadow-sm disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {sending ? 'Envoi…' : `Envoyer à l'administrateur`}
              </button>
            </div>
          </section>
        )}
        {sendError && items.length === 0 && <p role="alert" className="text-xs text-rose-700 dark:text-rose-400">{sendError}</p>}

        <section className="bg-white dark:bg-[#1A1D24] border border-stone-200 dark:border-stone-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-serif text-lg font-bold">
              Personnes identifiées ({tags.length})
            </h2>
            {tags.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPins(v => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white"
              >
                {showPins ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPins ? 'Masquer les repères' : 'Afficher les repères'}
              </button>
            )}
          </div>
          {tags.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">Aucune personne n'a encore été identifiée sur cette photo.</p>
          ) : (
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {tags.map(tag => {
                const active = activeN === tag.n;
                const isPlaceholder = tag.name === LIVING_PLACEHOLDER;
                return (
                  <li
                    key={tag.n}
                    id={`photo-tag-${tag.n}`}
                    onMouseEnter={() => setActiveN(tag.n)}
                    onMouseLeave={() => setActiveN(null)}
                    onClick={() => setActiveN(active ? null : tag.n)}
                    className={`flex items-start gap-2.5 p-2 rounded-lg cursor-default transition-colors ${
                      active ? 'bg-amber-100 dark:bg-amber-950/50' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                    }`}
                  >
                    <span className="w-6 h-6 shrink-0 rounded-full bg-stone-900 text-amber-200 text-[11px] font-bold font-mono flex items-center justify-center">
                      {tag.n}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold ${isPlaceholder ? 'italic text-stone-500 dark:text-stone-400' : ''}`}>
                        {tag.name}
                        {tag.years && <span className="ml-1.5 font-normal text-xs text-stone-500 dark:text-stone-400">({tag.years})</span>}
                      </span>
                      {tag.label && <span className="block text-xs text-stone-600 dark:text-stone-400">{tag.label}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <p className="text-center text-[11px] text-stone-500 dark:text-stone-400">
          Partagé avec Genealogor · version du {new Date(generatedAt).toLocaleString('fr-FR')}
        </p>
      </main>
    </div>
  );
};
