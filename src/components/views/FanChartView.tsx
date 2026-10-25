import React, { useState, useMemo } from 'react';
import type { Individual, Family } from '../../types/genealogy';
import { compute as computeImplex, isImplexedFor, type ImplexResult } from '../../lib/implex';
import { ChevronRight, Users, Layers, Sparkles, User, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface Props {
  rootPerson: Individual;
  individuals: Record<string, Individual> | Map<string, Individual>;
  families: Record<string, Family> | Map<string, Family>;
  onSelectPerson: (id: string) => void;
}

interface AncestorNode {
  person: Individual;
  sosa: number;
  generation: number;
}

function resolvePerson(id: string, individuals: Record<string, Individual> | Map<string, Individual>): Individual | undefined {
  if (individuals instanceof Map) return individuals.get(id);
  return individuals[id];
}

function resolveFamily(id: string, families: Record<string, Family> | Map<string, Family>): Family | undefined {
  if (families instanceof Map) return families.get(id);
  return families[id];
}

function computeAncestors(
  person: Individual,
  individuals: Record<string, Individual> | Map<string, Individual>,
  families: Record<string, Family> | Map<string, Family>,
  maxGen = 5,
): Map<number, AncestorNode> {
  const map = new Map<number, AncestorNode>();

  function visit(p: Individual | undefined, sosa: number, gen: number) {
    if (!p || gen > maxGen) return;
    map.set(sosa, { person: p, sosa, generation: gen });
    if (gen === maxGen) return;

    const childFams = p.familiesAsChild || (p as unknown as { famc?: string[] }).famc || [];
    if (!childFams.length) return;
    const fam = resolveFamily(childFams[0], families);
    if (!fam) return;

    const h = fam.husbandId || (fam as unknown as { husband?: string }).husband;
    const w = fam.wifeId || (fam as unknown as { wife?: string }).wife;

    if (h) visit(resolvePerson(h, individuals), sosa * 2, gen + 1);
    if (w) visit(resolvePerson(w, individuals), sosa * 2 + 1, gen + 1);
  }

  visit(person, 1, 0);
  return map;
}

function arcPath(cx: number, cy: number, innerR: number, outerR: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + outerR * Math.cos(toRad(startDeg));
  const y1 = cy + outerR * Math.sin(toRad(startDeg));
  const x2 = cx + outerR * Math.cos(toRad(endDeg));
  const y2 = cy + outerR * Math.sin(toRad(endDeg));
  const x3 = cx + innerR * Math.cos(toRad(endDeg));
  const y3 = cy + innerR * Math.sin(toRad(endDeg));
  const x4 = cx + innerR * Math.cos(toRad(startDeg));
  const y4 = cy + innerR * Math.sin(toRad(startDeg));
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  if (innerR === 0) {
    return `M ${cx} ${cy} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  }
  return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`;
}

function getLifespan(p: Individual): string {
  const by = p.birth?.parsedDate?.year ?? (p.birth?.date ? p.birth.date.match(/\b\d{4}\b/)?.[0] : undefined);
  const dy = p.death?.parsedDate?.year ?? (p.death?.date ? p.death.date.match(/\b\d{4}\b/)?.[0] : undefined);
  if (!by && !dy) return '';
  return `${by || '?'} - ${dy || ''}`;
}

export const FanChartView: React.FC<Props> = ({ rootPerson, individuals, families, onSelectPerson }) => {
  const [generations, setGenerations] = useState<number>(5);
  const [activeTab, setActiveTab] = useState<'fan' | 'pedigree' | 'hourglass'>('fan');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hoveredNode, setHoveredNode] = useState<AncestorNode | null>(null);

  const implexData: ImplexResult = useMemo(
    () => computeImplex(rootPerson, individuals, families, Math.min(generations + 1, 9)),
    [rootPerson, individuals, families, generations],
  );

  const ancestors = useMemo(
    () => computeAncestors(rootPerson, individuals, families, generations),
    [rootPerson, individuals, families, generations],
  );

  // SVG Fan Geometry setup
  const size = 800;
  const cx = size / 2;
  const cy = size / 2 + 50;
  const baseRadius = 65;
  const ringWidth = (size / 2 - baseRadius - 40) / generations;

  const arcs = useMemo(() => {
    const list = [];
    for (let gen = 0; gen <= generations; gen++) {
      const count = Math.pow(2, gen);
      const sweep = 180 / count;
      for (let i = 0; i < count; i++) {
        const sosa = Math.pow(2, gen) + i;
        const node = ancestors.get(sosa);
        const startAngle = 180 + i * sweep;
        const endAngle = 180 + (i + 1) * sweep;
        const innerR = gen === 0 ? 0 : baseRadius + (gen - 1) * ringWidth;
        const outerR = gen === 0 ? baseRadius : baseRadius + gen * ringWidth;
        list.push({ sosa, gen, startAngle, endAngle, innerR, outerR, node });
      }
    }
    return list;
  }, [generations, ancestors, ringWidth]);

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-50 dark:bg-stone-950 overflow-hidden text-stone-900 dark:text-stone-100">
      {/* Top control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60">
            <Layers className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-stone-900 dark:text-white">
                Éventail d'Ascendance Sosa
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300 font-mono font-medium">
                {ancestors.size} ancêtres
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Pivot : <strong className="font-semibold text-stone-800 dark:text-stone-200">{rootPerson.name}</strong> (Sosa n°1)
            </p>
          </div>
        </div>

        {/* View toggles & Generation selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-stone-200 dark:border-stone-800 p-0.5 bg-stone-100 dark:bg-stone-900">
            <button
              onClick={() => setActiveTab('fan')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'fan'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              Éventail (Fan)
            </button>
            <button
              onClick={() => setActiveTab('pedigree')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'pedigree'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              Pedigree
            </button>
            <button
              onClick={() => setActiveTab('hourglass')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'hourglass'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
              }`}
            >
              Sablier
            </button>
          </div>

          <div className="flex items-center gap-1.5 pl-2 border-l border-stone-200 dark:border-stone-800">
            <span className="text-xs text-stone-500 dark:text-stone-400">Générations :</span>
            {[4, 5, 6, 7].map((g) => (
              <button
                key={g}
                onClick={() => setGenerations(g)}
                className={`size-7 text-xs font-mono font-medium rounded-md transition-all ${
                  generations === g
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {activeTab === 'fan' && (
            <div className="flex items-center gap-1 pl-2 border-l border-stone-200 dark:border-stone-800">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.1))}
                className="p-1.5 rounded-md text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800"
                title="Dézoomer"
              >
                <ZoomOut className="size-4" />
              </button>
              <span className="text-xs font-mono text-stone-500 w-10 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(1.6, z + 0.1))}
                className="p-1.5 rounded-md text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800"
                title="Zoomer"
              >
                <ZoomIn className="size-4" />
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="p-1.5 rounded-md text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800"
                title="Réinitialiser"
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center relative">
        {activeTab === 'fan' && (
          <div className="relative flex flex-col items-center">
            {/* Hovered node floating summary */}
            {hoveredNode && (
              <div className="absolute top-2 left-4 z-20 px-3.5 py-2.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white/95 dark:bg-stone-900/95 shadow-lg backdrop-blur pointer-events-none max-w-xs animate-in fade-in duration-150">
                <div className="text-[10px] font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                  <Sparkles className="size-3" />
                  Sosa n°{hoveredNode.sosa} · Génération {hoveredNode.generation}
                </div>
                <div className="text-sm font-semibold text-stone-900 dark:text-white mt-0.5">
                  {hoveredNode.person.name}
                </div>
                <div className="text-xs text-stone-500 dark:text-stone-400 font-mono mt-0.5">
                  {getLifespan(hoveredNode.person) || 'Dates non documentées'}
                </div>
                {isImplexedFor(hoveredNode.person.id, implexData) && (
                  <div className="mt-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/80">
                    ⚠️ Ancêtre implexé (présent sur plusieurs branches)
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: 'top center',
                transition: 'transform 0.15s ease-out',
              }}
              className="p-4"
            >
              <svg
                width={size}
                height={size / 2 + 100}
                viewBox={`0 0 ${size} ${size / 2 + 100}`}
                className="select-none filter drop-shadow-sm"
              >
                <defs>
                  <radialGradient id="fanBg" cx="50%" cy="100%" r="90%">
                    <stop offset="0%" stopColor="rgba(245, 245, 244, 0.4)" />
                    <stop offset="100%" stopColor="rgba(231, 229, 228, 0.1)" />
                  </radialGradient>
                </defs>

                {arcs.map(({ sosa, gen, startAngle, endAngle, innerR, outerR, node }) => {
                  const hasPerson = !!node;
                  const isImplexed = hasPerson && isImplexedFor(node.person.id, implexData);
                  const isMale = node?.person.sex === 'M';
                  const isFemale = node?.person.sex === 'F';

                  // Colors
                  let fill = 'rgba(230, 230, 230, 0.4)';
                  if (hasPerson) {
                    if (gen === 0) fill = '#d97706'; // root amber
                    else if (isImplexed) fill = '#f59e0b'; // implex warning gold
                    else if (isMale) fill = '#3b82f6'; // male blue
                    else if (isFemale) fill = '#ec4899'; // female rose
                    else fill = '#8b5cf6';
                  }

                  const pathD = arcPath(cx, cy, innerR, outerR, startAngle, endAngle);

                  return (
                    <g
                      key={sosa}
                      className="cursor-pointer transition-opacity hover:opacity-85"
                      onClick={() => {
                        if (node?.person) onSelectPerson(node.person.id);
                      }}
                      onMouseEnter={() => setHoveredNode(node || null)}
                      onMouseLeave={() => setHoveredNode(null)}
                    >
                      <path
                        d={pathD}
                        fill={fill}
                        fillOpacity={hasPerson ? (gen === 0 ? 0.95 : 0.82) : 0.25}
                        stroke="rgba(255, 255, 255, 0.85)"
                        strokeWidth={gen < 4 ? 1.5 : 0.8}
                        className="transition-all duration-150 dark:stroke-stone-900"
                      />
                      {/* Name label on early generations */}
                      {hasPerson && gen <= 4 && (
                        <text
                          x={cx + ((innerR + outerR) / 2) * Math.cos(((startAngle + endAngle) / 2 * Math.PI) / 180)}
                          y={cy + ((innerR + outerR) / 2) * Math.sin(((startAngle + endAngle) / 2 * Math.PI) / 180)}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize={gen <= 2 ? 11 : 9}
                          fontWeight={gen <= 1 ? '700' : '600'}
                          className="pointer-events-none drop-shadow-sm font-sans"
                        >
                          {node.person.name.split(' ')[0]}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Center Root Info */}
                <circle cx={cx} cy={cy} r={baseRadius - 10} fill="#ffffff" className="dark:fill-stone-900 shadow-md" />
                <text
                  x={cx}
                  y={cy - 12}
                  textAnchor="middle"
                  className="fill-stone-900 dark:fill-white font-bold text-xs"
                >
                  {rootPerson.name.split(' ')[0]}
                </text>
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  className="fill-stone-500 dark:fill-stone-400 font-mono text-[10px]"
                >
                  Sosa n°1
                </text>
              </svg>
            </div>

            {/* Legend footer */}
            <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-stone-200 dark:border-stone-800 text-xs text-stone-600 dark:text-stone-400">
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-blue-500" />
                <span>Lignée Paternelle / Homme</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-pink-500" />
                <span>Lignée Maternelle / Femme</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-amber-500" />
                <span>Ancêtre Implexé</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-3 rounded-full bg-stone-300 dark:bg-stone-700" />
                <span>Ancêtre Non renseigné</span>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Pedigree 7 Generations */}
        {activeTab === 'pedigree' && (
          <div className="w-full max-w-5xl bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm overflow-x-auto">
            <h3 className="text-base font-semibold text-stone-900 dark:text-white mb-4 flex items-center gap-2">
              <Users className="size-4 text-amber-600" />
              Tableau Pedigree Ascendant (Arbre Rectangulaire)
            </h3>
            <div className="space-y-4 min-w-[700px]">
              {[0, 1, 2, 3, 4].slice(0, generations).map((gen) => {
                const count = Math.pow(2, gen);
                const startSosa = Math.pow(2, gen);
                return (
                  <div key={gen} className="space-y-1.5">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 font-semibold flex items-center gap-2">
                      <span>Génération {gen}</span>
                      <span className="text-[10px] text-stone-400 font-normal">
                        ({count} ancêtre{count > 1 ? 's' : ''} théorique{count > 1 ? 's' : ''})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
                      {Array.from({ length: count }).map((_, idx) => {
                        const sosa = startSosa + idx;
                        const node = ancestors.get(sosa);
                        const isMale = node?.person.sex === 'M';
                        const isFemale = node?.person.sex === 'F';
                        const isImplexed = node && isImplexedFor(node.person.id, implexData);

                        if (!node) {
                          return (
                            <div
                              key={sosa}
                              className="p-2 rounded-md border border-dashed border-stone-200 dark:border-stone-800 text-stone-400 text-center text-xs opacity-60"
                            >
                              <div className="font-mono text-[9px] text-stone-400">n°{sosa}</div>
                              <div className="text-[10px] italic">Inconnu</div>
                            </div>
                          );
                        }

                        return (
                          <button
                            key={sosa}
                            onClick={() => onSelectPerson(node.person.id)}
                            className={`p-2 rounded-md border text-left transition-all hover:scale-[1.02] shadow-xs ${
                              isImplexed
                                ? 'border-amber-400 dark:border-amber-600 bg-amber-50/70 dark:bg-amber-950/30'
                                : isMale
                                ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20'
                                : isFemale
                                ? 'border-pink-200 dark:border-pink-900/60 bg-pink-50/40 dark:bg-pink-950/20'
                                : 'border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[9px] font-mono text-stone-500 dark:text-stone-400">
                              <span>n°{sosa}</span>
                              {isImplexed && <span className="text-amber-600 font-bold">2×</span>}
                            </div>
                            <div className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate mt-0.5">
                              {node.person.name}
                            </div>
                            <div className="text-[10px] text-stone-500 dark:text-stone-400 font-mono truncate">
                              {getLifespan(node.person) || '—'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Sablier (Hourglass) */}
        {activeTab === 'hourglass' && (
          <div className="w-full max-w-4xl bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm">
            <h3 className="text-base font-semibold text-stone-900 dark:text-white mb-2 flex items-center gap-2">
              <Layers className="size-4 text-amber-600" />
              Vue Sablier — Ascendance & Descendance Réunies
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-6">
              Visualisez d'un seul coup d'œil les racines (parents, grands-parents) et les branches descendantes (enfants, petits-enfants) de <strong>{rootPerson.name}</strong>.
            </p>

            {/* Parents / Grandparents top */}
            <div className="space-y-4">
              <div className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 font-semibold text-center">
                ▲ Ascendants (Parents & Grands-Parents)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[2, 3, 4, 5].map((sosa) => {
                  const node = ancestors.get(sosa);
                  if (!node) return null;
                  return (
                    <button
                      key={sosa}
                      onClick={() => onSelectPerson(node.person.id)}
                      className="p-3 rounded-lg border border-stone-200 dark:border-stone-800 hover:border-amber-400 dark:hover:border-amber-600 bg-stone-50/50 dark:bg-stone-800/50 text-left transition-all"
                    >
                      <div className="text-[10px] font-mono text-stone-500">Sosa n°{sosa}</div>
                      <div className="text-sm font-semibold text-stone-900 dark:text-white truncate">
                        {node.person.name}
                      </div>
                      <div className="text-xs text-stone-500 font-mono">{getLifespan(node.person)}</div>
                    </button>
                  );
                })}
              </div>

              {/* Center Root Person */}
              <div className="py-4 my-2 flex justify-center">
                <div className="p-4 rounded-xl border-2 border-amber-500 bg-amber-50/80 dark:bg-amber-950/40 max-w-sm w-full text-center shadow-md">
                  <div className="text-xs font-mono uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold">
                    ★ Pivot Central (Sosa n°1)
                  </div>
                  <div className="text-base font-bold text-stone-900 dark:text-white mt-1">
                    {rootPerson.name}
                  </div>
                  <div className="text-xs text-stone-600 dark:text-stone-300 font-mono mt-0.5">
                    {getLifespan(rootPerson)}
                  </div>
                </div>
              </div>

              {/* Descendants bottom */}
              <div className="text-xs font-mono uppercase tracking-wider text-stone-500 dark:text-stone-400 font-semibold text-center">
                ▼ Descendants (Enfants & Petits-Enfants)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {(rootPerson.familiesAsSpouse || []).flatMap((famId: string) => {
                  const fam = resolveFamily(famId, families);
                  return (fam?.childrenIds || []).map((cid: string) => {
                    const child = resolvePerson(cid, individuals);
                    if (!child) return null;
                    return (
                      <button
                        key={cid}
                        onClick={() => onSelectPerson(child.id)}
                        className="p-3 rounded-lg border border-stone-200 dark:border-stone-800 hover:border-emerald-400 dark:hover:border-emerald-600 bg-stone-50/50 dark:bg-stone-800/50 text-left transition-all"
                      >
                        <div className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          Enfant
                        </div>
                        <div className="text-sm font-semibold text-stone-900 dark:text-white truncate">
                          {child.name}
                        </div>
                        <div className="text-xs text-stone-500 font-mono">{getLifespan(child)}</div>
                      </button>
                    );
                  });
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
