import React from 'react';
import { ArrowUp, Users, Heart, ArrowDown } from 'lucide-react';
import { Individual } from '../../types/genealogy';

interface FamilyLinksPanelProps {
  father?: Individual;
  mother?: Individual;
  siblings: Individual[];
  spouses: Individual[];
  children: Individual[];
  sosaMap: Record<string, number>;
  onSelectPerson: (id: string) => void;
}

function birthYear(person: Individual): string {
  const year = person.birth?.parsedDate?.year || person.birth?.date?.match(/\b(\d{4})\b/)?.[1];
  return year ? `° ${year}` : '';
}

/**
 * Liens familiaux de la personne affichée, lisibles sur tous les écrans :
 * un clic recentre l'arbre sur le parent, le frère ou la sœur, le conjoint ou l'enfant.
 */
export const FamilyLinksPanel: React.FC<FamilyLinksPanelProps> = ({
  father, mother, siblings, spouses, children, sosaMap, onSelectPerson,
}) => {
  const chip = (person: Individual, role?: string) => (
    <button
      key={person.id}
      type="button"
      onClick={() => onSelectPerson(person.id)}
      className="inline-flex items-center gap-1.5 max-w-full px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-left transition-colors cursor-pointer"
      title={`Afficher l'arbre de ${person.name}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${person.sex === 'M' ? 'bg-blue-600' : person.sex === 'F' ? 'bg-rose-500' : 'bg-stone-400'}`} />
      {role && <span className="text-[10px] uppercase font-mono text-stone-500 shrink-0">{role}</span>}
      <span className="font-serif text-xs font-bold text-stone-900 dark:text-stone-100 truncate">{person.name}</span>
      {birthYear(person) && <span className="text-[10px] font-mono text-stone-500 shrink-0">{birthYear(person)}</span>}
      {sosaMap[person.id] && (
        <span className="text-[10px] font-mono font-bold text-amber-800 dark:text-amber-400 shrink-0">S{sosaMap[person.id]}</span>
      )}
    </button>
  );

  const missing = (label: string) => (
    <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-dashed border-stone-300 dark:border-stone-700 text-[11px] italic text-stone-400">
      {label}
    </span>
  );

  const row = (icon: React.ReactNode, label: string, content: React.ReactNode) => (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 sm:w-32 sm:pt-1.5 shrink-0">
        {icon}
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5 min-w-0">{content}</div>
    </div>
  );

  return (
    <div className="bg-white dark:bg-[#1A1D24] border border-stone-200/90 dark:border-stone-800 rounded-2xl p-3 sm:p-4 shadow-2xs space-y-2.5">
      {row(
        <ArrowUp className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400" />,
        'Parents',
        <>
          {father ? chip(father, 'Père') : missing('Père non renseigné')}
          {mother ? chip(mother, 'Mère') : missing('Mère non renseignée')}
        </>
      )}
      {siblings.length > 0 && row(
        <Users className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400" />,
        `Fratrie (${siblings.length})`,
        siblings.map(s => chip(s))
      )}
      {spouses.length > 0 && row(
        <Heart className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400" />,
        spouses.length > 1 ? `Conjoints (${spouses.length})` : 'Conjoint',
        spouses.map(s => chip(s))
      )}
      {children.length > 0 && row(
        <ArrowDown className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400" />,
        `Enfants (${children.length})`,
        children.map(c => chip(c))
      )}
    </div>
  );
};
