import React, { useState, useMemo } from 'react';
import type { Individual, Family } from '../../types/genealogy';
import { runFullValidation, type ValidationIssue, type CompletenessField } from '../../lib/validation-checker';
import { ShieldCheck, AlertCircle, AlertTriangle, Info, CheckCircle2, Search, ArrowRight, ExternalLink, Award } from 'lucide-react';

interface Props {
  individuals: Record<string, Individual> | Map<string, Individual>;
  families: Record<string, Family> | Map<string, Family>;
  onSelectPerson: (id: string) => void;
}

export const ValidationView: React.FC<Props> = ({ individuals, families, onSelectPerson }) => {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const summary = useMemo(() => {
    return runFullValidation({ individuals, families });
  }, [individuals, families]);

  const filteredIssues = useMemo(() => {
    return summary.issues.filter((issue: ValidationIssue) => {
      if (filterSeverity !== 'all' && issue.severity !== filterSeverity) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          issue.personName.toLowerCase().includes(q) ||
          issue.message.toLowerCase().includes(q) ||
          issue.code.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [summary.issues, filterSeverity, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-50 dark:bg-stone-950 overflow-hidden text-stone-900 dark:text-stone-100">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-400 border border-red-200/60 dark:border-red-800/60">
            <ShieldCheck className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-stone-900 dark:text-white">
                Contrôle Qualité & Détection d'Incohérences
              </h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-medium ${
                summary.errorsCount > 0
                  ? 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-300'
                  : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300'
              }`}>
                {summary.errorsCount} erreur{summary.errorsCount > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Vérification des cycles généalogiques, dates impossibles et taux de complétude
            </p>
          </div>
        </div>

        {/* Global Score */}
        <div className="flex items-center gap-3 bg-white dark:bg-stone-900 px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-800 shadow-xs">
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">
              Score Global de Complétude
            </div>
            <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {summary.overallCompletenessPct}%
            </div>
          </div>
          <div className="size-9 rounded-full bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 border border-emerald-200 dark:border-emerald-800/60">
            <Award className="size-5" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full space-y-6">
        {/* Top KPIs Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setFilterSeverity('all')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              filterSeverity === 'all'
                ? 'border-stone-900 dark:border-white bg-stone-100 dark:bg-stone-800 shadow-xs'
                : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
            }`}
          >
            <div className="text-[10px] font-mono uppercase text-stone-500">Toutes Anomalies</div>
            <div className="text-2xl font-bold font-mono mt-0.5">{summary.issues.length}</div>
          </button>

          <button
            onClick={() => setFilterSeverity('error')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              filterSeverity === 'error'
                ? 'border-red-500 bg-red-50/60 dark:bg-red-950/40 shadow-xs'
                : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
            }`}
          >
            <div className="text-[10px] font-mono uppercase text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="size-3" />
              Erreurs Critiques
            </div>
            <div className="text-2xl font-bold font-mono text-red-600 dark:text-red-400 mt-0.5">
              {summary.errorsCount}
            </div>
          </button>

          <button
            onClick={() => setFilterSeverity('warn')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              filterSeverity === 'warn'
                ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/40 shadow-xs'
                : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
            }`}
          >
            <div className="text-[10px] font-mono uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertTriangle className="size-3" />
              Avertissements
            </div>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
              {summary.warningsCount}
            </div>
          </button>

          <button
            onClick={() => setFilterSeverity('info')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              filterSeverity === 'info'
                ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 shadow-xs'
                : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900'
            }`}
          >
            <div className="text-[10px] font-mono uppercase text-blue-600 dark:text-blue-400 flex items-center gap-1">
              <Info className="size-3" />
              Informations
            </div>
            <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5">
              {summary.infosCount}
            </div>
          </button>
        </div>

        {/* Completeness breakdown */}
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-3">
            Taux de Complétude par Champ
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {summary.completeness.map((item: CompletenessField) => (
              <div key={item.field} className="p-3 rounded-lg border border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/40">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-stone-700 dark:text-stone-300 font-medium">{item.label}</span>
                  <span className="font-mono font-bold text-stone-900 dark:text-white">{item.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
                  <div
                    style={{ width: `${item.pct}%` }}
                    className={`h-full rounded-full transition-all ${
                      item.pct >= 80 ? 'bg-emerald-500' : item.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                  />
                </div>
                <div className="text-[10px] text-stone-400 font-mono mt-1 text-right">
                  {item.count} / {item.total}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Issues List with Search Filter */}
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-white flex items-center gap-2">
              <span>Anomalies et Pistes d'Amélioration ({filteredIssues.length})</span>
            </h3>

            <div className="relative w-full sm:w-64">
              <Search className="size-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Filtrer par nom ou motif…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          {filteredIssues.length > 0 ? (
            <div className="divide-y divide-stone-100 dark:divide-stone-800">
              {filteredIssues.map((issue: ValidationIssue) => {
                const isError = issue.severity === 'error';
                const isWarn = issue.severity === 'warn';
                return (
                  <div
                    key={issue.id}
                    className="py-3 flex items-start justify-between gap-3 group hover:bg-stone-50/50 dark:hover:bg-stone-800/40 px-2 rounded-lg transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0">
                        {isError ? (
                          <AlertCircle className="size-4 text-red-600 dark:text-red-400" />
                        ) : isWarn ? (
                          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <Info className="size-4 text-blue-600 dark:text-blue-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => onSelectPerson(issue.personId)}
                            className="text-xs font-semibold text-stone-900 dark:text-white hover:text-amber-600 dark:hover:text-amber-400 underline decoration-stone-300 underline-offset-2"
                          >
                            {issue.personName}
                          </button>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-100 dark:bg-stone-800 text-stone-500">
                            {issue.code}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 dark:text-stone-300 mt-0.5">
                          {issue.message}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => onSelectPerson(issue.personId)}
                      className="px-2 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-amber-600 dark:hover:text-amber-400 shrink-0 flex items-center gap-1 opacity-80 group-hover:opacity-100"
                    >
                      <span>Voir</span>
                      <ArrowRight className="size-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-stone-500 flex flex-col items-center justify-center gap-2">
              <CheckCircle2 className="size-8 text-emerald-500 opacity-60" />
              <p>Aucune anomalie ne correspond aux filtres appliqués.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
