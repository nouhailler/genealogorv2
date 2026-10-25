import React from 'react';
import { BarChart3, Users, Heart, TrendingUp, Award, Calendar, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { GenealogyData } from '../../types/genealogy';
import { validateChronology } from '../../lib/validation';

interface StatsViewProps {
  data: GenealogyData;
  archiveCount: number;
  onSelectPerson?: (personId: string) => void;
  /** Contrôle de cohérence chronologique (administrateur uniquement) */
  showQualityChecks?: boolean;
}

export const StatsView: React.FC<StatsViewProps> = ({ data, archiveCount, onSelectPerson, showQualityChecks = true }) => {
  const individuals = Object.values(data.individuals);
  const families = Object.values(data.families);

  if (individuals.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 sm:p-12 shadow-xs space-y-4">
          <div className="w-14 h-14 mx-auto bg-amber-50 text-amber-900 border border-amber-200/80 rounded-2xl flex items-center justify-center">
            <BarChart3 className="w-7 h-7" />
          </div>
          <h3 className="font-serif text-xl font-bold text-stone-900">Aucune statistique disponible</h3>
          <p className="text-xs sm:text-sm text-stone-600">
            L'arbre généalogique est actuellement vierge. Les indicateurs de longévité, démographie et répartition des patronymes s'afficheront dès vos premières saisies.
          </p>
        </div>
      </div>
    );
  }

  const anomalies = validateChronology(data);

  const maleCount = individuals.filter(i => i.sex === 'M').length;
  const femaleCount = individuals.filter(i => i.sex === 'F').length;

  // Lifespan calculations
  const lifespans: number[] = [];
  for (const ind of individuals) {
    if (ind.birth?.parsedDate?.year && ind.death?.parsedDate?.year) {
      const age = ind.death.parsedDate.year - ind.birth.parsedDate.year;
      if (age >= 0 && age <= 120) {
        lifespans.push(age);
      }
    }
  }
  const avgLifespan = lifespans.length > 0 
    ? Math.round(lifespans.reduce((a, b) => a + b, 0) / lifespans.length) 
    : 0;

  // Surnames count
  const surnameCounts: Record<string, number> = {};
  for (const ind of individuals) {
    if (ind.surname) {
      const s = ind.surname.trim().toUpperCase();
      surnameCounts[s] = (surnameCounts[s] || 0) + 1;
    }
  }
  const topSurnames = Object.entries(surnameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // Given names count
  const givenNameCounts: Record<string, number> = {};
  for (const ind of individuals) {
    if (ind.givenName) {
      const firstGiven = ind.givenName.split(' ')[0].trim();
      if (firstGiven) {
        givenNameCounts[firstGiven] = (givenNameCounts[firstGiven] || 0) + 1;
      }
    }
  }
  const topGivenNames = Object.entries(givenNameCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  // Birth months count
  const monthNames = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
  const monthCounts = new Array(12).fill(0);
  for (const ind of individuals) {
    if (ind.birth?.parsedDate?.month && ind.birth.parsedDate.month >= 1 && ind.birth.parsedDate.month <= 12) {
      monthCounts[ind.birth.parsedDate.month - 1]++;
    }
  }
  const maxMonthVal = Math.max(...monthCounts, 1);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-8">
      
      {/* Header */}
      <div className="border-b border-stone-200/80 pb-4">
        <span className="text-xs uppercase tracking-widest font-mono text-stone-500">
          ANALYSE DÉMOGRAPHIQUE & GÉNÉALOGIQUE
        </span>
        <h1 className="font-serif text-3xl font-bold text-stone-900 mt-1">
          Statistiques & Contrôle de Cohérence
        </h1>
        <p className="text-xs text-stone-600 mt-0.5">
          Synthèse globale des patronymes, de la longévité et de la cohérence chronologique de l'arbre.
        </p>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-1">
          <span className="text-xs font-mono text-stone-500 uppercase tracking-wider block">Individus</span>
          <span className="font-serif text-3xl font-bold text-stone-900 block tabular-nums">{individuals.length}</span>
          <span className="text-xs text-stone-500 block">{maleCount} hommes · {femaleCount} femmes</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-1">
          <span className="text-xs font-mono text-stone-500 uppercase tracking-wider block">Unions & Familles</span>
          <span className="font-serif text-3xl font-bold text-stone-900 block tabular-nums">{families.length}</span>
          <span className="text-xs text-stone-500 block">Lignées répertoriées</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-1">
          <span className="text-xs font-mono text-stone-500 uppercase tracking-wider block">Âge Moyen au Décès</span>
          <span className="font-serif text-3xl font-bold text-stone-900 block tabular-nums">{avgLifespan} ans</span>
          <span className="text-xs text-stone-500 block">Sur les actes renseignés</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-xs space-y-1">
          <span className="text-xs font-mono text-stone-500 uppercase tracking-wider block">Actes d'Archives</span>
          <span className="font-serif text-3xl font-bold text-amber-900 block tabular-nums">{archiveCount}</span>
          <span className="text-xs text-stone-500 block">Pièces justificatives</span>
        </div>
      </div>

      {/* Grid: Surnames & Given names & Months */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Top Patronymes */}
        <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
          <h3 className="font-serif text-base font-bold text-stone-900 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-800" />
            <span>Patronymes Fréquents</span>
          </h3>

          <div className="space-y-2.5">
            {topSurnames.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between text-xs border-b border-stone-100 pb-2">
                <span className="font-bold text-stone-800">{name}</span>
                <span className="font-mono text-stone-500 font-semibold">{count} porteur(s)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Prénoms */}
        <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
          <h3 className="font-serif text-base font-bold text-stone-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-800" />
            <span>Prénoms Traditionnels</span>
          </h3>

          <div className="space-y-2.5">
            {topGivenNames.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between text-xs border-b border-stone-100 pb-2">
                <span className="font-semibold text-stone-800">{name}</span>
                <span className="font-mono text-stone-500 font-semibold">{count} personne(s)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Saisonnalité des naissances */}
        <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
          <h3 className="font-serif text-base font-bold text-stone-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-800" />
            <span>Mois de Naissance</span>
          </h3>

          <div className="space-y-2">
            {monthNames.map((mName, idx) => {
              const val = monthCounts[idx];
              const pct = (val / maxMonthVal) * 100;
              return (
                <div key={mName} className="flex items-center gap-2 text-xs">
                  <span className="w-9 font-mono text-stone-500 text-[11px]">{mName}</span>
                  <div className="flex-1 bg-stone-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-800 h-full rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-5 text-right font-mono text-[11px] text-stone-700 font-medium">{val}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Audit de Cohérence Chronologique */}
      {showQualityChecks && (
      <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-800" />
            <h3 className="font-serif text-base font-bold text-stone-900">
              Contrôle de Cohérence Chronologique (P1 - Exigence 6.4)
            </h3>
          </div>
          <span className="text-xs font-mono font-bold text-stone-500">
            {anomalies.length === 0 ? '0 anomalie détectée' : `${anomalies.length} anomalie(s)`}
          </span>
        </div>

        {anomalies.length === 0 ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-900">
            <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Toutes les dates de naissance, mariage et décès de l'arbre sont cohérentes et respectent les lois de la biologie humaine.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {anomalies.map(anom => (
              <div key={anom.id} className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold">{anom.personName} :</span> <span>{anom.message}</span>
                  {onSelectPerson && (
                    <button
                      type="button"
                      onClick={() => onSelectPerson(anom.personId)}
                      className="block font-semibold text-amber-800 hover:underline cursor-pointer"
                    >
                      Ouvrir la fiche pour corriger →
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

    </div>
  );
};
