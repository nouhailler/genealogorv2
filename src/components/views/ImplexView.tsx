import React, { useMemo } from 'react';
import type { Individual, Family } from '../../types/genealogy';
import { compute as computeImplex, type ImplexResult, type GenerationStat, type ImplexEntry } from '../../lib/implex';
import { Network, Sparkles, AlertTriangle, ArrowRight, Info, CheckCircle2, Award } from 'lucide-react';

interface Props {
  rootPerson: Individual;
  individuals: Record<string, Individual> | Map<string, Individual>;
  families: Record<string, Family> | Map<string, Family>;
  onSelectPerson: (id: string) => void;
}

function getLifespan(p: Individual): string {
  const by = p.birth?.parsedDate?.year ?? (p.birth?.date ? p.birth.date.match(/\b\d{4}\b/)?.[0] : undefined);
  const dy = p.death?.parsedDate?.year ?? (p.death?.date ? p.death.date.match(/\b\d{4}\b/)?.[0] : undefined);
  if (!by && !dy) return '';
  return `${by || '?'} - ${dy || ''}`;
}

export const ImplexView: React.FC<Props> = ({ rootPerson, individuals, families, onSelectPerson }) => {
  const data: ImplexResult = useMemo(() => {
    return computeImplex(rootPerson, individuals, families, 10);
  }, [rootPerson, individuals, families]);

  const maxImplex = data.implexEntries[0]?.sosaNumbers.length || 1;

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-50 dark:bg-stone-950 overflow-hidden text-stone-900 dark:text-stone-100">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60">
            <Network className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-stone-900 dark:text-white">
                Implexe & Taux d'Endogamie
              </h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${
                data.globalEndogamy > 5
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300'
              }`}>
                {data.globalEndogamy.toFixed(1)}% d'endogamie
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Analyse d'ascendance pour <strong className="font-semibold text-stone-800 dark:text-stone-200">{rootPerson.name}</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full space-y-6">
        {/* Top 4 KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs">
            <div className="text-[11px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Taux d'Endogamie
            </div>
            <div className={`text-2xl font-bold mt-1 font-mono ${data.globalEndogamy > 5 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {data.globalEndogamy.toFixed(1)}%
            </div>
            <div className="text-xs text-stone-500 mt-0.5">
              Part des cases Sosa redondantes
            </div>
          </div>

          <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs">
            <div className="text-[11px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Ancêtres Distincts
            </div>
            <div className="text-2xl font-bold mt-1 font-mono text-stone-900 dark:text-white">
              {data.distinctAncestors}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">
              sur {data.totalAncestorSlots} cases explorées
            </div>
          </div>

          <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs">
            <div className="text-[11px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Cas d'Implexe
            </div>
            <div className="text-2xl font-bold mt-1 font-mono text-amber-600 dark:text-amber-400">
              {data.implexEntries.length}
            </div>
            <div className="text-xs text-stone-500 mt-0.5">
              ancêtres présents ≥ 2 fois
            </div>
          </div>

          <div className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-xs">
            <div className="text-[11px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400">
              Multi-Occurrence Max
            </div>
            <div className="text-2xl font-bold mt-1 font-mono text-stone-900 dark:text-white">
              {maxImplex}×
            </div>
            <div className="text-xs text-stone-500 mt-0.5">
              occurrences d'un même individu
            </div>
          </div>
        </div>

        {/* Pedagogical Notice */}
        <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-3">
          <Info className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Qu'est-ce que l'implexe en généalogie ?</p>
            <p className="leading-relaxed text-stone-700 dark:text-stone-300">
              L'implexe correspond à la perte d'ancêtres théoriques due aux mariages entre cousins ou personnes issues de mêmes ancêtres. Plus l'on remonte dans le temps, plus les lignées se croisent, évitant l'impossible prolifération exponentielle des ancêtres.
            </p>
          </div>
        </div>

        {/* Table of Generations */}
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-4">
            Complétude et Endogamie par Génération (G0 à G8)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-[11px] font-mono uppercase text-stone-500 dark:text-stone-400">
                  <th className="py-2 px-3">Génération</th>
                  <th className="py-2 px-3">Barre de Complétude</th>
                  <th className="py-2 px-3 text-right">Théoriques</th>
                  <th className="py-2 px-3 text-right">Présents</th>
                  <th className="py-2 px-3 text-right">Distincts</th>
                  <th className="py-2 px-3 text-right">Endogamie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60 font-mono">
                {data.generationStats.slice(0, 9).map((g: GenerationStat) => (
                  <tr key={g.generation} className="hover:bg-stone-50/50 dark:hover:bg-stone-800/30">
                    <td className="py-2.5 px-3 font-semibold text-stone-800 dark:text-stone-200">
                      G{g.generation}
                    </td>
                    <td className="py-2.5 px-3 w-48">
                      <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden flex">
                        <div
                          style={{ width: `${Math.min(100, g.completeness)}%` }}
                          className="bg-amber-600 rounded-full transition-all"
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-stone-500">{g.theoretical}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-stone-900 dark:text-stone-100">
                      {g.present}
                    </td>
                    <td className="py-2.5 px-3 text-right text-stone-900 dark:text-stone-100">
                      {g.distinct}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      <span className={g.endogamyRate > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400'}>
                        {g.endogamyRate.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detailed Implex Ancestors List */}
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-3 flex items-center justify-between">
            <span>Ancêtres Présents sur Plusieurs Lignées ({data.implexEntries.length})</span>
            {data.implexEntries.length === 0 && (
              <span className="text-xs text-stone-500 font-normal">Aucun implexe détecté sur les générations explorées</span>
            )}
          </h3>

          {data.implexEntries.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.implexEntries.map((item: ImplexEntry) => (
                <button
                  key={item.person.id}
                  onClick={() => onSelectPerson(item.person.id)}
                  className="p-3.5 rounded-lg border border-stone-200 dark:border-stone-800 hover:border-amber-400 dark:hover:border-amber-600 bg-stone-50/50 dark:bg-stone-800/40 text-left transition-all group shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-stone-900 dark:text-white group-hover:text-amber-600 transition-colors">
                      {item.person.name}
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                      {item.sosaNumbers.length}×
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 font-mono mt-0.5">
                    {getLifespan(item.person)}
                  </div>
                  <div className="mt-2 text-[11px] text-stone-600 dark:text-stone-400 flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-stone-700 dark:text-stone-300">Numéros Sosa :</span>
                    {item.sosaNumbers.map((s: number) => (
                      <span key={s} className="px-1.5 py-0.2 rounded bg-stone-200 dark:bg-stone-700 font-mono text-[10px]">
                        n°{s}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-stone-500 flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="size-8 text-emerald-500 opacity-60" />
              <p>Cet arbre ne présente pas de boucle d'endogamie sur les générations actuellement renseignées.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
