import React, { useMemo, useState } from 'react';
import { Inbox, Check, Clock, X, Search, UserCheck, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { ArchiveDocument, GenealogyData, Individual } from '../types/genealogy';
import { ReceivedProposalItem, suggestPersons } from '../lib/photo-proposals';
import { normalize } from '../lib/place-gazetteer';

export type ProposalResolution =
  | { type: 'accept'; personId: string }
  | { type: 'later' }
  | { type: 'reject' };

interface ProposalReviewPanelProps {
  archive: ArchiveDocument;
  data: GenealogyData;
  proposals: ReceivedProposalItem[];
  onResolve: (item: ReceivedProposalItem, resolution: ProposalResolution) => Promise<void>;
  /** Associe (personId) ou retire (null) une identification gardée « à créer plus tard » */
  onResolvePending: (pendingId: string, personId: string | null) => Promise<void>;
  /** Republie le lien photo pour que les repères validés y apparaissent ; absent si pas de lien sur cet appareil */
  onRepublish?: () => Promise<void>;
}

/** Choix d'une personne de l'arbre : suggestions d'après le nom proposé, puis recherche libre */
const PersonPicker: React.FC<{
  persons: Individual[];
  proposedName: string;
  busy: boolean;
  onPick: (personId: string) => void;
}> = ({ persons, proposedName, busy, onPick }) => {
  const [query, setQuery] = useState('');
  const suggested = useMemo(() => suggestPersons(proposedName, persons, 4), [proposedName, persons]);
  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return [];
    return persons.filter(p => normalize(p.name).includes(q)).slice(0, 8);
  }, [query, persons]);
  const year = (p: Individual) => p.birth?.date?.match(/\d{4}/)?.[0];

  const chip = (p: Individual) => (
    <button
      key={p.id}
      type="button"
      disabled={busy}
      onClick={() => onPick(p.id)}
      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
      title={`Associer à ${p.name}`}
    >
      <UserCheck className="w-3 h-3" /> {p.name}{year(p) ? ` (${year(p)})` : ''}
    </button>
  );

  return (
    <div className="space-y-1.5">
      {suggested.length > 0 && <div className="flex flex-wrap gap-1">{suggested.map(chip)}</div>}
      <div className="relative">
        <Search className="w-3 h-3 text-stone-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Chercher une personne de l'arbre…"
          aria-label="Chercher une personne de l'arbre"
          className="w-full text-[11px] bg-white border border-stone-200 rounded-lg pl-6 pr-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-700"
        />
      </div>
      {query && (
        results.length > 0
          ? <div className="flex flex-wrap gap-1">{results.filter(r => !suggested.includes(r)).map(chip)}</div>
          : <p className="text-[11px] text-stone-500 italic">Aucune personne ne correspond. Créez-la d'abord, ou gardez la proposition « à créer ».</p>
      )}
    </div>
  );
};

/** Examen des propositions d'identification reçues pour une photo partagée, et des personnes « à créer » */
export const ProposalReviewPanel: React.FC<ProposalReviewPanelProps> = ({
  archive,
  data,
  proposals,
  onResolve,
  onResolvePending,
  onRepublish,
}) => {
  const persons = useMemo(() => Object.values(data.individuals).sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const pending = archive.pendingIdentifications || [];
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsRepublish, setNeedsRepublish] = useState(false);
  const [republishing, setRepublishing] = useState(false);

  if (proposals.length === 0 && pending.length === 0 && !needsRepublish) return null;

  const run = async (key: string, action: () => Promise<void>, changesTags = false) => {
    setBusyKey(key);
    setError(null);
    try {
      await action();
      if (changesTags && onRepublish) setNeedsRepublish(true);
    } catch (e: any) {
      setError(e?.message || 'Action impossible.');
    } finally {
      setBusyKey(null);
    }
  };

  const republish = async () => {
    if (!onRepublish) return;
    setRepublishing(true);
    setError(null);
    try {
      await onRepublish();
      setNeedsRepublish(false);
    } catch (e: any) {
      setError(e?.message || 'Mise à jour du lien impossible.');
    } finally {
      setRepublishing(false);
    }
  };

  const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

  return (
    <section className="border border-amber-300 bg-amber-50/50 rounded-2xl p-4 space-y-4" aria-label="Propositions d'identification">
      <div className="flex items-center gap-2">
        <Inbox className="w-4 h-4 text-amber-800" />
        <h3 className="font-serif text-base font-bold text-stone-900">
          Propositions d'identification ({proposals.length})
          {pending.length > 0 && <span className="font-sans text-xs font-normal text-stone-600"> · {pending.length} personne(s) à créer</span>}
        </h3>
      </div>

      {needsRepublish && (
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-900">
          <span>Les repères validés ne sont pas encore visibles par les personnes qui ont reçu le lien.</span>
          <button
            type="button"
            onClick={republish}
            disabled={republishing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${republishing ? 'animate-spin' : ''}`} /> Mettre à jour le lien partagé
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        {/* Photo avec les propositions (pointillés) et les personnes à créer (gris) */}
        {archive.fileData && (
          <div className="lg:col-span-2 bg-stone-900 rounded-xl p-2 flex justify-center">
            <div className="relative inline-block max-w-full">
              <img src={archive.fileData} alt={archive.title} className="block max-w-full max-h-80 w-auto h-auto rounded-lg select-none" draggable={false} />
              {proposals.map((p, i) => (
                <span
                  key={p.key}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full border-2 border-dashed text-[9px] font-bold font-mono shadow ${
                    hoverKey === p.key ? 'scale-125 z-20 border-amber-500 bg-amber-500 text-white' : 'z-10 border-amber-400 bg-amber-50/90 text-amber-900'
                  }`}
                >
                  P{i + 1}
                </span>
              ))}
              {pending.map((p, i) => (
                <span
                  key={p.id}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-full border-2 border-dashed text-[9px] font-bold font-mono shadow ${
                    hoverKey === p.id ? 'scale-125 z-20 border-stone-600 bg-stone-600 text-white' : 'z-10 border-stone-400 bg-stone-100/90 text-stone-700'
                  }`}
                >
                  C{i + 1}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="lg:col-span-3 space-y-3">
          {proposals.map((p, i) => {
            const busy = busyKey === p.key;
            return (
              <div
                key={p.key}
                onMouseEnter={() => setHoverKey(p.key)}
                onMouseLeave={() => setHoverKey(null)}
                className="p-3 rounded-xl bg-white border border-stone-200 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 break-words">
                      <span className="font-mono text-[10px] text-amber-800 mr-1.5">P{i + 1}</span>{p.name}
                    </p>
                    {p.details && <p className="text-xs text-stone-600 break-words">{p.details}</p>}
                    <p className="text-[10px] text-stone-400">
                      Proposé{p.proposer ? ` par ${p.proposer}` : ''}{p.submittedAt ? ` le ${fmtDate(p.submittedAt)}` : ''}
                    </p>
                    {p.comment && <p className="text-[11px] text-stone-500 italic break-words">« {p.comment} »</p>}
                  </div>
                  {busy && <Loader2 className="w-4 h-4 animate-spin text-stone-400 shrink-0" />}
                </div>
                <PersonPicker
                  persons={persons}
                  proposedName={p.name}
                  busy={busyKey !== null}
                  onPick={personId => run(p.key, () => onResolve(p, { type: 'accept', personId }), true)}
                />
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-stone-100">
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => run(p.key, () => onResolve(p, { type: 'later' }))}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
                    title="La personne n'est pas encore dans l'arbre : à créer, puis à associer"
                  >
                    <Clock className="w-3 h-3" /> À créer plus tard
                  </button>
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => run(p.key, () => onResolve(p, { type: 'reject' }))}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg text-rose-700 hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                  >
                    <X className="w-3 h-3" /> Refuser
                  </button>
                </div>
              </div>
            );
          })}

          {pending.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Personnes à créer ({pending.length})
              </h4>
              <p className="text-[11px] text-stone-500">
                Créez la fiche (bouton « Ajouter une personne » de la vue Arbre), puis associez-la ici : le repère sera placé sur la photo.
              </p>
              {pending.map((p, i) => {
                const busy = busyKey === p.id;
                return (
                  <div
                    key={p.id}
                    onMouseEnter={() => setHoverKey(p.id)}
                    onMouseLeave={() => setHoverKey(null)}
                    className="p-3 rounded-xl bg-white border border-dashed border-stone-300 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900 break-words">
                          <span className="font-mono text-[10px] text-stone-500 mr-1.5">C{i + 1}</span>{p.name}
                        </p>
                        {p.details && <p className="text-xs text-stone-600 break-words">{p.details}</p>}
                        <p className="text-[10px] text-stone-400">
                          Proposé{p.proposer ? ` par ${p.proposer}` : ''} le {fmtDate(p.receivedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => run(p.id, () => onResolvePending(p.id, null))}
                        className="p-1 text-stone-400 hover:text-rose-700 disabled:opacity-50 shrink-0"
                        aria-label={`Retirer ${p.name}`}
                        title="Retirer"
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <PersonPicker
                      persons={persons}
                      proposedName={p.name}
                      busy={busyKey !== null}
                      onPick={personId => run(p.id, () => onResolvePending(p.id, personId), true)}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {proposals.length === 0 && pending.length === 0 && (
            <p className="text-xs text-stone-600 flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-700" /> Toutes les propositions ont été traitées.</p>
          )}
        </div>
      </div>
    </section>
  );
};
