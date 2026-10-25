import React, { useState, useMemo } from 'react';
import type { Individual, Family } from '../../types/genealogy';
import { computeAboville, findDeadBranches } from '../../lib/descendance';
import { ChevronRight, ChevronDown, GitFork, User, Search, CornerDownRight, AlertCircle } from 'lucide-react';

interface Props {
  rootPerson: Individual;
  individuals: Record<string, Individual> | Map<string, Individual>;
  families: Record<string, Family> | Map<string, Family>;
  onSelectPerson: (id: string) => void;
}

function resolvePerson(id: string, individuals: Record<string, Individual> | Map<string, Individual>): Individual | undefined {
  if (individuals instanceof Map) return individuals.get(id);
  return individuals[id];
}

function resolveFamily(id: string, families: Record<string, Family> | Map<string, Family>): Family | undefined {
  if (families instanceof Map) return families.get(id);
  return families[id];
}

function getLifespan(p: Individual): string {
  const by = p.birth?.parsedDate?.year ?? (p.birth?.date ? p.birth.date.match(/\b\d{4}\b/)?.[0] : undefined);
  const dy = p.death?.parsedDate?.year ?? (p.death?.date ? p.death.date.match(/\b\d{4}\b/)?.[0] : undefined);
  if (!by && !dy) return '';
  return `${by || '?'} - ${dy || ''}`;
}

interface NodeProps {
  person: Individual;
  individuals: Record<string, Individual> | Map<string, Individual>;
  families: Record<string, Family> | Map<string, Family>;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onSelect: (id: string) => void;
  abovilleMap: Map<string, string>;
  deadBranchesSet: Set<string>;
}

const DescendantItem: React.FC<NodeProps> = ({
  person,
  individuals,
  families,
  depth,
  expanded,
  toggle,
  onSelect,
  abovilleMap,
  deadBranchesSet,
}) => {
  const childIds: string[] = [];
  const spouseFams = person.familiesAsSpouse || (person as unknown as { fams?: string[] }).fams || [];

  for (const fid of spouseFams) {
    const fam = resolveFamily(fid, families);
    if (!fam) continue;
    const cids = fam.childrenIds || (fam as unknown as { children?: string[] }).children || [];
    for (const cid of cids) {
      if (!childIds.includes(cid)) childIds.push(cid);
    }
  }

  const isOpen = expanded.has(person.id);
  const hasChildren = childIds.length > 0;
  const isDeadBranch = deadBranchesSet.has(person.id);
  const abovilleCode = abovilleMap.get(person.id);

  const sexColor =
    person.sex === 'M'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-900'
      : person.sex === 'F'
      ? 'bg-pink-100 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 border-pink-200 dark:border-pink-900'
      : 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700';

  return (
    <div className="relative">
      <div className="flex items-center gap-2 py-1.5">
        {hasChildren ? (
          <button
            onClick={() => toggle(person.id)}
            className="size-7 grid place-items-center rounded-md text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors shrink-0"
            aria-label={isOpen ? 'Replier' : 'Déplier'}
          >
            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="size-7 grid place-items-center shrink-0">
            <span className="size-1.5 rounded-full bg-stone-300 dark:bg-stone-700" />
          </span>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onSelect(person.id)}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-amber-400 dark:hover:border-amber-600 hover:shadow-xs transition-all text-left"
          >
            {abovilleCode && (
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-stone-200/80 dark:border-stone-700/80 shrink-0">
                {abovilleCode}
              </span>
            )}

            <span className={`size-2 rounded-full shrink-0 ${person.sex === 'F' ? 'bg-pink-500' : 'bg-blue-500'}`} />

            <span className="text-sm font-semibold text-stone-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
              {person.name}
            </span>

            <span className="text-xs font-mono text-stone-500 dark:text-stone-400 shrink-0">
              {getLifespan(person)}
            </span>

            {hasChildren && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60 shrink-0">
                {childIds.length} enfant{childIds.length > 1 ? 's' : ''}
              </span>
            )}
          </button>

          {isDeadBranch && !hasChildren && (
            <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500 italic flex items-center gap-1">
              (Branche sans postérité)
            </span>
          )}
        </div>
      </div>

      {isOpen && hasChildren && (
        <div className="ml-4 pl-3.5 sm:pl-5 border-l-2 border-stone-200 dark:border-stone-800 border-dashed space-y-1 my-1">
          {childIds.map((cid) => {
            const child = resolvePerson(cid, individuals);
            if (!child) return null;
            return (
              <DescendantItem
                key={cid}
                person={child}
                individuals={individuals}
                families={families}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                onSelect={onSelect}
                abovilleMap={abovilleMap}
                deadBranchesSet={deadBranchesSet}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export const DescendantsView: React.FC<Props> = ({ rootPerson, individuals, families, onSelectPerson }) => {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([rootPerson.id]));

  const abovilleMap = useMemo(
    () => computeAboville(rootPerson, individuals, families, 12),
    [rootPerson, individuals, families],
  );

  const deadBranches = useMemo(
    () => findDeadBranches(individuals, families),
    [individuals, families],
  );

  const deadBranchesSet = useMemo(
    () => new Set(deadBranches.map((d: Individual) => d.id)),
    [deadBranches],
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const all = new Set<string>();
    for (const id of Array.from(abovilleMap.keys())) {
      all.add(id);
    }
    setExpanded(all);
  };

  const collapseAll = () => {
    setExpanded(new Set([rootPerson.id]));
  };

  const descendantCount = abovilleMap.size - 1;

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-50 dark:bg-stone-950 overflow-hidden text-stone-900 dark:text-stone-100">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">
            <GitFork className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-stone-900 dark:text-white">
                Descendance Repliable d'Aboville
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-300 font-mono font-medium">
                {descendantCount} descendant{descendantCount > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Ancêtre souche : <strong className="font-semibold text-stone-800 dark:text-stone-200">{rootPerson.name}</strong> (Aboville n°1)
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 shadow-xs"
          >
            Tout déplier
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 shadow-xs"
          >
            Tout replier
          </button>
        </div>
      </div>

      {/* Main tree list */}
      <div className="flex-1 overflow-auto p-6 max-w-4xl mx-auto w-full">
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm">
          <div className="mb-4 pb-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
            <span>
              La numérotation d'Aboville attribue <strong>1</strong> à la souche, puis <strong>1.1</strong> pour l'aîné, <strong>1.2</strong> pour le second enfant, <strong>1.1.1</strong> pour le premier petit-enfant, etc.
            </span>
          </div>

          <DescendantItem
            person={rootPerson}
            individuals={individuals}
            families={families}
            depth={0}
            expanded={expanded}
            toggle={toggle}
            onSelect={onSelectPerson}
            abovilleMap={abovilleMap}
            deadBranchesSet={deadBranchesSet}
          />
        </div>
      </div>
    </div>
  );
};
