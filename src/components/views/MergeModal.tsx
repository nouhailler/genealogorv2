import React, { useState } from 'react';
import { X, GitMerge, Check, AlertTriangle, Users, ArrowRight } from 'lucide-react';
import { GenealogyData, DuplicateCandidate, Individual } from '../../types/genealogy';
import { findDuplicateCandidates, mergeIndividuals, MergeFieldChoices } from '../../lib/duplicate-detector';

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: GenealogyData;
  onMergeComplete: (newData: GenealogyData) => void;
}

export const MergeModal: React.FC<MergeModalProps> = ({
  isOpen,
  onClose,
  data,
  onMergeComplete,
}) => {
  const [selectedCandidate, setSelectedCandidate] = useState<DuplicateCandidate | null>(null);
  const [fieldChoices, setFieldChoices] = useState<MergeFieldChoices | null>(null);

  if (!isOpen) return null;

  const candidates = findDuplicateCandidates(data);

  const handleSelectCandidate = (cand: DuplicateCandidate) => {
    setSelectedCandidate(cand);
    setFieldChoices({
      name: cand.personA.name,
      givenName: cand.personA.givenName || cand.personB.givenName || '',
      surname: cand.personA.surname || cand.personB.surname || '',
      sex: cand.personA.sex || cand.personB.sex || 'X',
      birth: cand.personA.birth || cand.personB.birth,
      death: cand.personA.death || cand.personB.death,
      occupations: Array.from(new Set([...(cand.personA.occupations || []), ...(cand.personB.occupations || [])])),
      notes: Array.from(new Set([...(cand.personA.notes || []), ...(cand.personB.notes || [])])),
    });
  };

  const handleExecuteMerge = () => {
    if (!selectedCandidate || !fieldChoices) return;
    const newData = mergeIndividuals(data, selectedCandidate.personA.id, selectedCandidate.personB.id, fieldChoices);
    onMergeComplete(newData);
    setSelectedCandidate(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#FBF9F5] border border-stone-300 shadow-2xl rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200/80 bg-stone-100/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-900 rounded-lg">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-stone-900">
                Détection & Fusion des Doublons
              </h2>
              <p className="text-xs text-stone-600">
                Identifiez les fiches redondantes et fusionnez-les sans aucune perte de liens de parenté ou d'archives.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {!selectedCandidate ? (
            /* Liste des candidats détectés */
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-stone-600">
                <span>{candidates.length} doublon(s) potentiel(s) détecté(s)</span>
              </div>

              {candidates.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-xl border border-dashed border-stone-200 text-xs text-stone-500 space-y-2">
                  <Check className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="font-serif text-sm font-bold text-stone-900">Aucun doublon détecté</p>
                  <p className="text-xs text-stone-500">Votre arbre généalogique ne présente aucune fiche redondante évidente.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {candidates.map((cand, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-white border border-stone-200 rounded-xl hover:border-amber-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-sm font-bold text-stone-900">{cand.personA.name}</span>
                          <span className="text-xs text-stone-400 font-mono">({cand.personA.birth?.date || 'N/A'})</span>
                          <ArrowRight className="w-3.5 h-3.5 text-stone-400" />
                          <span className="font-serif text-sm font-bold text-stone-900">{cand.personB.name}</span>
                          <span className="text-xs text-stone-400 font-mono">({cand.personB.birth?.date || 'N/A'})</span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-stone-500 flex-wrap">
                          <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Similarité : {cand.score}%
                          </span>
                          <span>·</span>
                          <span>{cand.reasons.join(', ')}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleSelectCandidate(cand)}
                        className="px-4 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shadow-sm transition-all whitespace-nowrap"
                      >
                        Examiner & Fusionner
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Comparaison côte à côte & choix des champs */
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedCandidate(null)}
                  className="text-xs font-semibold text-amber-800 hover:underline"
                >
                  ← Retour à la liste des doublons
                </button>
                <span className="text-xs font-mono font-bold text-stone-500">
                  Score de similarité : {selectedCandidate.score}%
                </span>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <p>
                  Choisissez ci-dessous les informations à conserver pour la fiche finale. Les relations familiales (enfants, conjoints, parents), les notes et les pièces justificatives d'archives seront toutes automatiquement préservées et rattachées à la fiche unique.
                </p>
              </div>

              {/* Table de comparaison */}
              <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs text-xs">
                <div className="grid grid-cols-3 bg-stone-100/70 p-3 font-semibold text-stone-700 border-b border-stone-200 font-mono uppercase text-[11px]">
                  <span>Champ</span>
                  <span>Fiche A ({selectedCandidate.personA.id})</span>
                  <span>Fiche B ({selectedCandidate.personB.id})</span>
                </div>

                {/* Nom */}
                <div className="grid grid-cols-3 p-3 border-b border-stone-100 items-center">
                  <span className="font-medium text-stone-500">Nom complet</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="name"
                      checked={fieldChoices?.name === selectedCandidate.personA.name}
                      onChange={() => setFieldChoices(prev => prev ? ({ ...prev, name: selectedCandidate.personA.name }) : null)}
                    />
                    <span className="font-bold">{selectedCandidate.personA.name}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="name"
                      checked={fieldChoices?.name === selectedCandidate.personB.name}
                      onChange={() => setFieldChoices(prev => prev ? ({ ...prev, name: selectedCandidate.personB.name }) : null)}
                    />
                    <span className="font-bold">{selectedCandidate.personB.name}</span>
                  </label>
                </div>

                {/* Naissance */}
                <div className="grid grid-cols-3 p-3 border-b border-stone-100 items-center">
                  <span className="font-medium text-stone-500">Naissance</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="birth"
                      checked={fieldChoices?.birth === selectedCandidate.personA.birth}
                      onChange={() => setFieldChoices(prev => prev ? ({ ...prev, birth: selectedCandidate.personA.birth }) : null)}
                    />
                    <span>{selectedCandidate.personA.birth?.date || 'N/A'} {selectedCandidate.personA.birth?.place ? `à ${selectedCandidate.personA.birth.place}` : ''}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="birth"
                      checked={fieldChoices?.birth === selectedCandidate.personB.birth}
                      onChange={() => setFieldChoices(prev => prev ? ({ ...prev, birth: selectedCandidate.personB.birth }) : null)}
                    />
                    <span>{selectedCandidate.personB.birth?.date || 'N/A'} {selectedCandidate.personB.birth?.place ? `à ${selectedCandidate.personB.birth.place}` : ''}</span>
                  </label>
                </div>

                {/* Décès */}
                <div className="grid grid-cols-3 p-3 border-b border-stone-100 items-center">
                  <span className="font-medium text-stone-500">Décès</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="death"
                      checked={fieldChoices?.death === selectedCandidate.personA.death}
                      onChange={() => setFieldChoices(prev => prev ? ({ ...prev, death: selectedCandidate.personA.death }) : null)}
                    />
                    <span>{selectedCandidate.personA.death?.date || 'N/A'}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="death"
                      checked={fieldChoices?.death === selectedCandidate.personB.death}
                      onChange={() => setFieldChoices(prev => prev ? ({ ...prev, death: selectedCandidate.personB.death }) : null)}
                    />
                    <span>{selectedCandidate.personB.death?.date || 'N/A'}</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setSelectedCandidate(null)}
                  className="px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleExecuteMerge}
                  className="px-5 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shadow-sm"
                >
                  Confirmer la fusion des deux fiches
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
