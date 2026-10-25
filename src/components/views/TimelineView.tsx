import React, { useState } from 'react';
import { Clock, Calendar, MapPin, User, ChevronRight, Landmark, ArrowUp, ArrowDown, GitFork } from 'lucide-react';
import { GenealogyData, LifeEvent } from '../../types/genealogy';
import { TimelineScope, getLineageDepths, relationLabel, ageAtDeath, groupByGeneration, generationTitle } from '../../lib/timeline-scope';

interface TimelineViewProps {
  data: GenealogyData;
  onSelectPerson: (id: string) => void;
  /** Fiche de départ (personne sélectionnée) */
  personId?: string;
  scope: TimelineScope;
  onScopeChange: (scope: TimelineScope) => void;
}

interface TimelineEvent {
  year: number;
  /** Clé de tri au jour près (AAAAMMJJ, mois et jour à 0 s'ils sont inconnus) */
  sortKey: number;
  dateStr: string;
  type: 'birth' | 'death' | 'marriage' | 'historical';
  personId?: string;
  personName: string;
  place?: string;
  description: string;
  /** Lien de parenté avec la personne de départ */
  relation?: string;
  /** Âge au décès, quand il peut être établi */
  age?: string;
  /** Génération par rapport à la personne de départ (absente pour le contexte historique) */
  depth?: number;
}

const dateKey = (p: { year?: number; month?: number; day?: number }) =>
  (p.year || 0) * 10000 + (p.month || 0) * 100 + (p.day || 0);

const HISTORICAL_CONTEXT: Array<{ year: number; title: string; desc: string }> = [
  { year: 1715, title: 'Mort de Louis XIV', desc: 'Début de la Régence et du règne de Louis XV.' },
  { year: 1740, title: 'Guerre de Succession d\'Autriche', desc: 'Conflit naval et corsaire majeur dans l\'Atlantique.' },
  { year: 1789, title: 'Révolution Française', desc: 'Prise de la Bastille, abolition des privilèges et création de l\'état civil.' },
  { year: 1792, title: 'Proclamation de la Ière République', desc: 'Entrée en vigueur du calendrier républicain.' },
  { year: 1804, title: 'Sacre de Napoléon Ier', desc: 'Proclamation de l\'Empire et Code Civil des Français.' },
  { year: 1815, title: 'Bataille de Waterloo', desc: 'Fin du Premier Empire et Restauration des Bourbons.' },
  { year: 1848, title: 'Révolution de 1848 & IIe République', desc: 'Abolition définitive de l\'esclavage et suffrage universel masculin.' },
  { year: 1870, title: 'Guerre Franco-Prussienne', desc: 'Chute du Second Empire et proclamation de la IIIe République.' },
  { year: 1914, title: 'Début de la Première Guerre Mondiale', desc: 'Mobilisation générale du 2 août 1914.' },
  { year: 1918, title: 'Armistice du 11 Novembre', desc: 'Victoire des Alliés et fin des combats de la Grande Guerre.' },
];

export const TimelineView: React.FC<TimelineViewProps> = ({ data, onSelectPerson, personId, scope, onScopeChange }) => {
  const [filterType, setFilterType] = useState<string>('all');

  const timelineEvents: TimelineEvent[] = [];

  // Périmètre : la fiche de départ et ses ascendants ou descendants, ou tout l'arbre
  const person = personId ? data.individuals[personId] : undefined;
  const effectiveScope: TimelineScope = person ? scope : 'all';
  const depths = person && effectiveScope !== 'all' ? getLineageDepths(data, person.id, effectiveScope) : null;
  const inScope = (id?: string) => !depths || (!!id && depths.has(id));
  const relationOf = (id: string) => {
    const depth = depths?.get(id);
    return depth === undefined ? undefined : relationLabel(depth, data.individuals[id].sex);
  };

  // Extract events from individuals
  for (const ind of Object.values(data.individuals)) {
    if (!inScope(ind.id)) continue;
    if (ind.birth?.parsedDate?.year) {
      timelineEvents.push({
        year: ind.birth.parsedDate.year,
        sortKey: dateKey(ind.birth.parsedDate),
        dateStr: ind.birth.date || `${ind.birth.parsedDate.year}`,
        type: 'birth',
        personId: ind.id,
        personName: ind.name,
        place: ind.birth.place,
        description: `Naissance de ${ind.name}`,
        relation: relationOf(ind.id),
        depth: depths?.get(ind.id),
      });
    }

    if (ind.death?.parsedDate?.year) {
      timelineEvents.push({
        year: ind.death.parsedDate.year,
        sortKey: dateKey(ind.death.parsedDate),
        dateStr: ind.death.date || `${ind.death.parsedDate.year}`,
        type: 'death',
        personId: ind.id,
        personName: ind.name,
        place: ind.death.place,
        description: `Décès de ${ind.name}`,
        relation: relationOf(ind.id),
        age: ageAtDeath(ind),
        depth: depths?.get(ind.id),
      });
    }
  }

  // Extract events from marriages
  for (const fam of Object.values(data.families)) {
    if (!inScope(fam.husbandId) && !inScope(fam.wifeId)) continue;
    if (fam.marriage?.parsedDate?.year) {
      const husb = fam.husbandId ? data.individuals[fam.husbandId] : undefined;
      const wife = fam.wifeId ? data.individuals[fam.wifeId] : undefined;
      const names = [husb?.name, wife?.name].filter(Boolean).join(' et ');
      timelineEvents.push({
        year: fam.marriage.parsedDate.year,
        sortKey: dateKey(fam.marriage.parsedDate),
        dateStr: fam.marriage.date || `${fam.marriage.parsedDate.year}`,
        type: 'marriage',
        personId: husb?.id || wife?.id,
        personName: names,
        place: fam.marriage.place,
        description: `Mariage : ${names}`,
        // Génération du conjoint de la lignée le plus proche de la personne
        depth: [fam.husbandId, fam.wifeId]
          .map(id => (id ? depths?.get(id) : undefined))
          .filter((d): d is number => d !== undefined)
          .sort((a, b) => Math.abs(a) - Math.abs(b))[0],
      });
    }
  }

  // Add historical context (limité à la période couverte par la lignée affichée)
  const familyYears = timelineEvents.map(e => e.year);
  const minYear = Math.min(...familyYears) - 10;
  const maxYear = Math.max(...familyYears) + 10;
  for (const hist of HISTORICAL_CONTEXT) {
    if (depths && (familyYears.length === 0 || hist.year < minYear || hist.year > maxYear)) continue;
    timelineEvents.push({
      year: hist.year,
      sortKey: dateKey({ year: hist.year }),
      dateStr: `${hist.year}`,
      type: 'historical',
      personName: hist.title,
      description: hist.desc,
    });
  }

  timelineEvents.sort((a, b) => a.sortKey - b.sortKey);

  const filteredEvents = timelineEvents.filter(e => {
    if (filterType === 'all') return true;
    if (filterType === 'family') return e.type !== 'historical';
    if (filterType === 'historical') return e.type === 'historical';
    return e.type === filterType;
  });

  // Centrée sur la personne : générations de la plus proche à la plus lointaine, chacune dans l'ordre des dates.
  // « Tout l'arbre » reste une liste unique du plus ancien au plus récent.
  const sections: Array<{ depth: number | null; events: TimelineEvent[] }> = depths
    ? groupByGeneration(filteredEvents).map(g => ({ depth: g.depth, events: g.items }))
    : [{ depth: null, events: filteredEvents }];

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200/80 pb-4">
        <div>
          <span className="text-xs uppercase tracking-widest font-mono text-stone-500">
            LIGNE DU TEMPS & CONTEXTE HISTORIQUE
          </span>
          <h1 className="font-serif text-3xl font-bold text-stone-900 mt-1">
            {person && effectiveScope !== 'all' ? `Chronologie de ${person.name}` : 'Chronologie Familiale'}
          </h1>
          <p className="text-xs text-stone-600 mt-0.5">
            {effectiveScope === 'ascendants'
              ? `${person?.name} et ses ascendants (${(depths?.size || 1) - 1}), génération par génération en partant des parents, en regard des grands événements de l'Histoire de France.`
              : effectiveScope === 'descendants'
                ? `${person?.name} et ses descendants (${(depths?.size || 1) - 1}), génération par génération en partant des enfants, en regard des grands événements de l'Histoire de France.`
                : 'Retracez les naissances, mariages et disparitions en regard des grands événements de l\'Histoire de France.'}
          </p>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2">
        {/* Périmètre : depuis la fiche (ascendants / descendants) ou tout l'arbre */}
        {person && (
          <div className="flex items-center p-1 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-600 shadow-2xs self-start" role="group" aria-label="Périmètre de la chronologie">
            {([
              ['ascendants', 'Ascendants', ArrowUp],
              ['descendants', 'Descendants', ArrowDown],
              ['all', "Tout l'arbre", GitFork],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => onScopeChange(value)}
                aria-pressed={effectiveScope === value}
                className={`flex items-center gap-1 px-2.5 py-1 rounded transition-colors cursor-pointer ${effectiveScope === value ? 'bg-amber-900 text-white font-bold' : 'hover:text-stone-900'}`}
              >
                <Icon className="w-3 h-3" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Filter buttons */}
        <div className="flex items-center p-1 bg-white border border-stone-200 rounded-lg text-xs font-medium text-stone-600 shadow-2xs self-start">
          <button
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded transition-colors ${filterType === 'all' ? 'bg-amber-100 text-amber-900 font-bold' : 'hover:text-stone-900'}`}
          >
            Tous
          </button>
          <button
            onClick={() => setFilterType('family')}
            className={`px-2.5 py-1 rounded transition-colors ${filterType === 'family' ? 'bg-amber-100 text-amber-900 font-bold' : 'hover:text-stone-900'}`}
          >
            Famille
          </button>
          <button
            onClick={() => setFilterType('historical')}
            className={`px-2.5 py-1 rounded transition-colors ${filterType === 'historical' ? 'bg-amber-100 text-amber-900 font-bold' : 'hover:text-stone-900'}`}
          >
            Histoire
          </button>
        </div>
        </div>
      </div>

      {/* Point de départ : la chronologie s'organise autour de cette personne */}
      {person && effectiveScope !== 'all' && (
        <button
          type="button"
          onClick={() => onSelectPerson(person.id)}
          className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-amber-800 bg-amber-50 text-left hover:bg-amber-100 transition-colors cursor-pointer"
          title={`Ouvrir la fiche de ${person.name}`}
        >
          <span className="w-10 h-10 rounded-full bg-amber-900 text-white font-serif font-bold text-lg flex items-center justify-center shrink-0">
            {person.givenName?.[0] || person.name[0]}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-widest font-mono text-amber-800">
              Point de départ · {effectiveScope === 'ascendants' ? 'on remonte vers les ancêtres' : 'on avance vers la descendance'}
            </span>
            <span className="block font-serif text-lg font-bold text-stone-900 truncate">{person.name}</span>
            <span className="block text-xs text-stone-600">
              {person.birth?.date ? `° ${person.birth.date}` : 'Date de naissance non renseignée'}
              {person.death?.date ? ` · + ${person.death.date}` : ''}
            </span>
          </span>
          {effectiveScope === 'ascendants'
            ? <ArrowUp className="w-5 h-5 text-amber-800 ml-auto shrink-0" />
            : <ArrowDown className="w-5 h-5 text-amber-800 ml-auto shrink-0" />}
        </button>
      )}

      {/* Vertical Timeline */}
      {filteredEvents.length === 0 ? (
        <div className="p-8 text-center bg-white border border-dashed border-stone-200 rounded-2xl text-xs text-stone-500">
          Aucun événement familial à afficher pour le moment. L'arbre est vierge ou aucun événement ne correspond à ce filtre.
        </div>
      ) : (
        sections.map(section => (
        <section key={section.depth ?? 'all'} className="space-y-3">
          {section.depth !== null && (
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-900">
              <span className="px-2 py-0.5 rounded bg-amber-100 font-mono">{section.depth === 0 ? '0' : section.depth > 0 ? `+${section.depth}` : section.depth}</span>
              <span>{generationTitle(section.depth)}</span>
              <span className="flex-1 h-px bg-amber-200" />
            </h2>
          )}
          <div className="relative pl-6 md:pl-8 border-l-2 border-stone-300/80 space-y-6 py-2">
            {section.events.map((event, idx) => {
            const isHistorical = event.type === 'historical';

            return (
              <div key={idx} className="relative group">
                {/* Timeline marker node */}
                <div
                  className={`absolute -left-[31px] md:-left-[39px] top-1.5 w-4 h-4 rounded-full border-2 bg-white transition-transform group-hover:scale-125 ${
                    isHistorical
                      ? 'border-amber-700 bg-amber-50'
                      : event.type === 'birth'
                        ? 'border-emerald-600'
                        : event.type === 'marriage'
                          ? 'border-amber-600'
                          : 'border-rose-600'
                  }`}
                />

                {/* Event card */}
                <div
                  onClick={() => event.personId && onSelectPerson(event.personId)}
                  className={`p-4 rounded-xl border transition-all text-left ${
                    isHistorical
                      ? 'bg-amber-50/60 border-amber-200/80 shadow-2xs'
                      : 'bg-white border-stone-200 hover:border-amber-700 hover:bg-stone-50/60 cursor-pointer shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-stone-900">
                      {event.dateStr}
                    </span>

                    <span
                      className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded ${
                        isHistorical
                          ? 'bg-amber-100 text-amber-950 font-semibold'
                          : event.type === 'birth'
                            ? 'bg-emerald-50 text-emerald-800'
                            : event.type === 'marriage'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-rose-50 text-rose-800'
                      }`}
                    >
                      {isHistorical ? 'Événement Historique' : event.type === 'birth' ? 'Naissance' : event.type === 'marriage' ? 'Mariage' : 'Décès'}
                    </span>
                  </div>

                  <h3 className="font-serif text-sm font-bold text-stone-900 mt-1">
                    {event.description}
                    {event.age && (
                      <span className="font-sans font-semibold text-rose-800"> · {event.age}</span>
                    )}
                  </h3>

                  {event.relation && (
                    <span className="inline-block mt-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                      {event.relation}
                    </span>
                  )}

                  {event.place && (
                    <p className="text-xs text-stone-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-stone-400" />
                      <span>{event.place}</span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </section>
        ))
      )}

    </div>
  );
};
