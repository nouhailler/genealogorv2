import React, { useState, useMemo } from 'react';
import type { Individual, Family } from '../../types/genealogy';
import { Columns, Search, User, ArrowLeftRight, Check, X, Calendar, MapPin, Briefcase } from 'lucide-react';

interface Props {
  person: Individual;
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

export const CompareView: React.FC<Props> = ({ person, individuals, families, onSelectPerson }) => {
  const [otherId, setOtherId] = useState<string | null>(null);
  const [searchPicker, setSearchPicker] = useState('');

  const personList = useMemo(() => {
    return individuals instanceof Map ? Array.from(individuals.values()) : Object.values(individuals);
  }, [individuals]);

  const otherPerson = otherId ? resolvePerson(otherId, individuals) : null;

  const candidates = useMemo(() => {
    if (!searchPicker.trim()) return [];
    const q = searchPicker.toLowerCase();
    return personList
      .filter((p) => p.id !== person.id && p.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [searchPicker, personList, person.id]);

  const countChildren = (p: Individual): number => {
    let count = 0;
    const spouseFams = p.familiesAsSpouse || (p as unknown as { fams?: string[] }).fams || [];
    for (const fid of spouseFams) {
      const fam = resolveFamily(fid, families);
      if (fam) {
        const cids = fam.childrenIds || (fam as unknown as { children?: string[] }).children || [];
        count += cids.length;
      }
    }
    return count;
  };

  const getFather = (p: Individual): Individual | undefined => {
    const childFams = p.familiesAsChild || (p as unknown as { famc?: string[] }).famc || [];
    if (!childFams.length) return undefined;
    const fam = resolveFamily(childFams[0], families);
    if (!fam) return undefined;
    const hid = fam.husbandId || (fam as unknown as { husband?: string }).husband;
    return hid ? resolvePerson(hid, individuals) : undefined;
  };

  const getMother = (p: Individual): Individual | undefined => {
    const childFams = p.familiesAsChild || (p as unknown as { famc?: string[] }).famc || [];
    if (!childFams.length) return undefined;
    const fam = resolveFamily(childFams[0], families);
    if (!fam) return undefined;
    const wid = fam.wifeId || (fam as unknown as { wife?: string }).wife;
    return wid ? resolvePerson(wid, individuals) : undefined;
  };

  interface CompareField {
    label: string;
    val1: string | number;
    val2: string | number;
    icon?: React.ReactNode;
  }

  const comparisonFields: CompareField[] = useMemo(() => {
    if (!otherPerson) return [];
    return [
      { label: 'Nom complet', val1: person.name, val2: otherPerson.name },
      { label: 'Sexe', val1: person.sex === 'M' ? 'Homme' : person.sex === 'F' ? 'Femme' : 'Inconnu', val2: otherPerson.sex === 'M' ? 'Homme' : otherPerson.sex === 'F' ? 'Femme' : 'Inconnu' },
      { label: 'Date de naissance', val1: person.birth?.date || '—', val2: otherPerson.birth?.date || '—' },
      { label: 'Lieu de naissance', val1: person.birth?.place || '—', val2: otherPerson.birth?.place || '—' },
      { label: 'Date de décès', val1: person.death?.date || '—', val2: otherPerson.death?.date || '—' },
      { label: 'Lieu de décès', val1: person.death?.place || '—', val2: otherPerson.death?.place || '—' },
      { label: 'Père', val1: getFather(person)?.name || 'Non documenté', val2: getFather(otherPerson)?.name || 'Non documenté' },
      { label: 'Mère', val1: getMother(person)?.name || 'Non documenté', val2: getMother(otherPerson)?.name || 'Non documenté' },
      { label: 'Nombre d\'enfants', val1: countChildren(person), val2: countChildren(otherPerson) },
      { label: 'Professions', val1: (person.occupations && person.occupations.join(', ')) || (person as unknown as { occupation?: string }).occupation || '—', val2: (otherPerson.occupations && otherPerson.occupations.join(', ')) || (otherPerson as unknown as { occupation?: string }).occupation || '—' },
      { label: 'Numéro Sosa', val1: person.sosaNumber ? `n°${person.sosaNumber}` : '—', val2: otherPerson.sosaNumber ? `n°${otherPerson.sosaNumber}` : '—' },
      { label: 'Code Aboville', val1: person.dAbovilleNumber || '—', val2: otherPerson.dAbovilleNumber || '—' },
    ];
  }, [person, otherPerson]);

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-50 dark:bg-stone-950 overflow-hidden text-stone-900 dark:text-stone-100">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
            <Columns className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-white">
              Comparateur de Fiches Individuelles
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Analyse différentielle pour déceler doublons, homonymies ou cousinages
            </p>
          </div>
        </div>

        {otherPerson && (
          <button
            onClick={() => setOtherId(null)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 shadow-xs"
          >
            Changer la 2e personne
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6 max-w-5xl mx-auto w-full space-y-6">
        {!otherPerson ? (
          <div className="max-w-lg mx-auto bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm text-center">
            <div className="size-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
              <ArrowLeftRight className="size-6" />
            </div>
            <h3 className="text-base font-semibold text-stone-900 dark:text-white mb-1">
              Comparer avec qui ?
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
              Sélectionnez une seconde personne de votre arbre à mettre en regard de <strong>{person.name}</strong>.
            </p>

            <div className="relative">
              <Search className="size-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Rechercher par nom ou prénom…"
                value={searchPicker}
                onChange={(e) => setSearchPicker(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {candidates.length > 0 && (
              <div className="mt-3 rounded-lg border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden text-left shadow-sm">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setOtherId(c.id);
                      setSearchPicker('');
                    }}
                    className="w-full p-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/60 flex items-center justify-between text-xs transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-stone-900 dark:text-white">{c.name}</div>
                      <div className="text-[11px] font-mono text-stone-500">{getLifespan(c)}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-medium">
                      Sélectionner
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm overflow-hidden">
            {/* Table Header with both people */}
            <div className="grid grid-cols-[160px_1fr_1fr] border-b border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-800/50 p-4 items-center">
              <div className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
                Critère
              </div>
              <div className="px-3 border-l border-stone-200 dark:border-stone-800">
                <button
                  onClick={() => onSelectPerson(person.id)}
                  className="font-bold text-sm text-stone-900 dark:text-white hover:text-indigo-600 transition-colors text-left"
                >
                  {person.name}
                </button>
                <div className="text-xs font-mono text-stone-500">{getLifespan(person)}</div>
              </div>
              <div className="px-3 border-l border-stone-200 dark:border-stone-800">
                <button
                  onClick={() => onSelectPerson(otherPerson.id)}
                  className="font-bold text-sm text-stone-900 dark:text-white hover:text-indigo-600 transition-colors text-left"
                >
                  {otherPerson.name}
                </button>
                <div className="text-xs font-mono text-stone-500">{getLifespan(otherPerson)}</div>
              </div>
            </div>

            {/* Comparison Rows */}
            <div className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
              {comparisonFields.map((field) => {
                const isIdentical = String(field.val1).trim().toLowerCase() === String(field.val2).trim().toLowerCase() && field.val1 !== '—';
                return (
                  <div
                    key={field.label}
                    className={`grid grid-cols-[160px_1fr_1fr] p-3 items-center transition-colors ${
                      isIdentical ? 'bg-emerald-50/30 dark:bg-emerald-950/20' : 'hover:bg-stone-50/50 dark:hover:bg-stone-800/30'
                    }`}
                  >
                    <div className="font-medium text-stone-600 dark:text-stone-400">
                      {field.label}
                    </div>
                    <div className="px-3 border-l border-stone-200 dark:border-stone-800 font-mono text-stone-900 dark:text-stone-100">
                      {field.val1}
                    </div>
                    <div className="px-3 border-l border-stone-200 dark:border-stone-800 font-mono text-stone-900 dark:text-stone-100 flex items-center justify-between">
                      <span>{field.val2}</span>
                      {isIdentical && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-sans font-semibold">
                          Identique
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
