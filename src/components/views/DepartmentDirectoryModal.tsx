import React, { useState, useMemo } from 'react';
import { AD, deptArchives } from '../../lib/archives-templates';
import { allDepts, deptName, region, DeptEntry } from '../../lib/place-gazetteer';
import { Building2, Search, ExternalLink, X, MapPin, Globe } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialDeptCode?: string;
}

export const DepartmentDirectoryModal: React.FC<Props> = ({ isOpen, onClose, initialDeptCode }) => {
  const [search, setSearch] = useState(initialDeptCode || '');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');

  const depts = useMemo(() => allDepts(), []);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const d of depts) set.add(d.region);
    return Array.from(set).sort();
  }, [depts]);

  const filteredDepts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return depts.filter((d: { code: string } & DeptEntry) => {
      if (selectedRegion !== 'all' && d.region !== selectedRegion) return false;
      if (!q) return true;
      return (
        d.code.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        d.region.toLowerCase().includes(q)
      );
    });
  }, [depts, search, selectedRegion]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col overflow-hidden text-stone-900 dark:text-stone-100"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 dark:border-stone-800 shrink-0 bg-stone-50/70 dark:bg-stone-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
              <Building2 className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white">
                Répertoire des Archives Départementales Françaises
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Accès direct aux 97 portails de consultation de l'état civil et des registres paroissiaux
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-4 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center gap-3 bg-stone-50/30 dark:bg-stone-900/50 shrink-0">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="size-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Rechercher par numéro (ex: 87, 44), nom (Haute-Vienne) ou région…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 font-medium">Région :</span>
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="py-1.5 px-2.5 text-xs rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="all">Toutes les régions</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {filteredDepts.map((d: { code: string } & DeptEntry) => {
              const ad = deptArchives(d.code);
              return (
                <div
                  key={d.code}
                  className="p-3.5 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 hover:border-amber-400 dark:hover:border-amber-600 transition-all shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="size-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-mono font-bold text-xs flex items-center justify-center border border-amber-200 dark:border-amber-800">
                        {d.code}
                      </span>
                      <span className="text-[10px] text-stone-400 font-mono">{d.region}</span>
                    </div>
                    <div className="font-semibold text-sm text-stone-900 dark:text-white mt-1">
                      {d.name}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                      {ad ? ad.label : 'Archives Départementales'}
                    </div>
                  </div>

                  {ad ? (
                    <a
                      href={ad.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3.5 inline-flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-800 hover:bg-amber-50 dark:hover:bg-amber-950/50 text-stone-700 dark:text-stone-300 hover:text-amber-800 dark:hover:text-amber-300 text-xs font-medium border border-stone-200/80 dark:border-stone-700/80 transition-colors"
                    >
                      <span>Consulter les registres</span>
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : (
                    <span className="mt-3.5 text-[11px] text-stone-400 italic">
                      Portail en cours de référencement
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {filteredDepts.length === 0 && (
            <div className="py-12 text-center text-xs text-stone-500">
              Aucun département ne correspond à « {search} ».
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
