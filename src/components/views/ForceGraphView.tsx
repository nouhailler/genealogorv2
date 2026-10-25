import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { Individual, Family } from '../../types/genealogy';
import { Share2, Maximize2, Eye, X, ArrowRight } from 'lucide-react';
import { buildRelationEdges, egoNetwork, LinkFilter, RelationEdge } from '../../lib/relation-graph';

interface Props {
  individuals: Record<string, Individual> | Map<string, Individual>;
  families: Record<string, Family> | Map<string, Family>;
  /** Personne au centre du graphe (fiche sélectionnée) */
  selectedPersonId?: string;
  /** Recentrer le graphe sur une personne (sans quitter l'écran) */
  onFocusPerson: (id: string) => void;
  /** Ouvrir la fiche de la personne */
  onOpenProfile: (id: string) => void;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  sex: 'M' | 'F' | 'X';
  years: string;
  distance: number;
  generation: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  kind: RelationEdge['kind'];
}

/** Profondeur : nombre de liens depuis la personne centrale (null = tout ce qui lui est relié) */
type Depth = 1 | 2 | 3 | null;

const GENERATION_SPACING = 130;
/** Au-delà, seuls les noms des proches immédiats s'affichent (sauf demande) */
const MAX_LABELLED_NODES = 70;

function lifeYears(p: Individual): string {
  const year = (date?: string, parsed?: number) => parsed || date?.match(/\b(\d{4})\b/)?.[1];
  const b = year(p.birth?.date, p.birth?.parsedDate?.year);
  const d = year(p.death?.date, p.death?.parsedDate?.year);
  if (b && d) return `${b} – ${d}`;
  if (b) return `° ${b}`;
  if (d) return `+ ${d}`;
  return '';
}

export const ForceGraphView: React.FC<Props> = ({
  individuals,
  families,
  selectedPersonId,
  onFocusPerson,
  onOpenProfile,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');
  const [depth, setDepth] = useState<Depth>(2);
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);

  const personMap = useMemo(
    () => (individuals instanceof Map ? Object.fromEntries(individuals) : individuals) as Record<string, Individual>,
    [individuals]
  );
  const familyList = useMemo(
    () => (families instanceof Map ? Array.from(families.values()) : Object.values(families)),
    [families]
  );

  const centerId = selectedPersonId && personMap[selectedPersonId]
    ? selectedPersonId
    : Object.keys(personMap)[0];
  const center = centerId ? personMap[centerId] : undefined;

  const graphData = useMemo(() => {
    if (!centerId) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
    const edges = buildRelationEdges(familyList, new Set(Object.keys(personMap)), linkFilter);
    const members = egoNetwork(edges, centerId, depth);
    const nodes: GraphNode[] = [...members.entries()].map(([id, m]) => ({
      id,
      label: personMap[id].name,
      sex: personMap[id].sex,
      years: lifeYears(personMap[id]),
      distance: m.distance,
      generation: m.generation,
    }));
    const links: GraphLink[] = edges
      .filter(e => members.has(e.a) && members.has(e.b))
      .map(e => ({ source: e.a, target: e.b, kind: e.kind }));
    return { nodes, links };
  }, [personMap, familyList, centerId, linkFilter, depth]);

  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    if (graphData.nodes.length === 0) return;

    const container = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', event => container.attr('transform', event.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    zoomRef.current = zoom;

    const nodes: GraphNode[] = graphData.nodes.map(d => ({ ...d }));
    const links: GraphLink[] = graphData.links.map(d => ({ ...d }));
    // La personne centrale au milieu, chaque génération sur sa ligne : ancêtres en haut, descendants en bas
    for (const n of nodes) {
      n.y = n.generation * GENERATION_SPACING;
      n.x = (Math.random() - 0.5) * 200;
      if (n.id === centerId) {
        n.fx = 0;
        n.fy = 0;
      }
    }

    const labelled = (d: GraphNode) =>
      showAllLabels || nodes.length <= MAX_LABELLED_NODES || d.distance <= 1;

    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links).id(d => d.id)
        .distance(d => (d.kind === 'spouse' ? 60 : GENERATION_SPACING))
        .strength(d => (d.kind === 'spouse' ? 0.9 : 0.4)))
      .force('charge', d3.forceManyBody<GraphNode>().strength(-260).distanceMax(500))
      .force('generation', d3.forceY<GraphNode>(d => d.generation * GENERATION_SPACING).strength(0.9))
      .force('x', d3.forceX<GraphNode>(0).strength(0.03))
      // Évitement calculé sur la largeur du nom affiché (≈ 6,5 px par caractère), pas seulement sur le cercle
      .force('collide', d3.forceCollide<GraphNode>(d => (labelled(d) ? Math.max(30, d.label.length * 3.4) : 16)).strength(0.9))
      .stop();
    // Mise en place calculée d'avance : le graphe s'affiche stable, sans « danse » initiale
    simulation.tick(Math.min(400, 120 + nodes.length));

    const link = container.append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', d => (d.kind === 'spouse' ? '#f59e0b' : '#94a3b8'))
      .attr('stroke-width', d => (d.kind === 'spouse' ? 2.5 : 1.5))
      .attr('stroke-dasharray', d => (d.kind === 'spouse' ? '5 3' : null))
      .attr('stroke-opacity', 0.8);

    const node = container.append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        setCardId(d.id);
        if (d.id !== centerId) onFocusPerson(d.id);
      });

    node.append('circle')
      .attr('r', d => (d.id === centerId ? 16 : 11))
      .attr('fill', d => (d.sex === 'M' ? '#3b82f6' : d.sex === 'F' ? '#ec4899' : '#8b5cf6'))
      .attr('stroke', d => (d.id === centerId ? '#b45309' : '#ffffff'))
      .attr('stroke-width', d => (d.id === centerId ? 4 : 2));

    // Nom complet sous le cercle, détouré pour rester lisible sur les liens
    node.filter(d => labelled(d))
      .append('text')
      .text(d => d.label)
      .attr('text-anchor', 'middle')
      .attr('y', d => (d.id === centerId ? 32 : 26))
      .attr('font-size', d => (d.id === centerId ? '14px' : '12px'))
      .attr('font-weight', d => (d.id === centerId ? 700 : 600))
      .attr('paint-order', 'stroke')
      .attr('stroke-width', 4)
      .attr('stroke-linejoin', 'round')
      .attr('class', 'fill-stone-800 stroke-stone-50 dark:fill-stone-100 dark:stroke-stone-950 select-none pointer-events-none');

    node.filter(d => labelled(d) && !!d.years)
      .append('text')
      .text(d => d.years)
      .attr('text-anchor', 'middle')
      .attr('y', d => (d.id === centerId ? 47 : 40))
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, monospace')
      .attr('paint-order', 'stroke')
      .attr('stroke-width', 3)
      .attr('class', 'fill-stone-500 stroke-stone-50 dark:fill-stone-400 dark:stroke-stone-950 select-none pointer-events-none');

    node.append('title').text(d => `${d.label}${d.years ? ` (${d.years})` : ''}`);

    const draw = () => {
      link
        .attr('x1', d => (d.source as GraphNode).x!)
        .attr('y1', d => (d.source as GraphNode).y!)
        .attr('x2', d => (d.target as GraphNode).x!)
        .attr('y2', d => (d.target as GraphNode).y!);
      node.attr('transform', d => `translate(${d.x},${d.y})`);
    };
    draw();
    simulation.on('tick', draw);

    node.call(d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.2).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        if (d.id !== centerId) {
          d.fx = null;
          d.fy = null;
        }
      }));

    // Cadrage : tout le graphe à l'écran, sans agrandir au-delà de 1,4
    const fit = (animate = false) => {
      const width = svgEl.clientWidth || 800;
      const height = svgEl.clientHeight || 600;
      const xs = nodes.map(n => n.x!);
      const ys = nodes.map(n => n.y!);
      const [minX, maxX] = [Math.min(...xs) - 90, Math.max(...xs) + 90];
      const [minY, maxY] = [Math.min(...ys) - 40, Math.max(...ys) + 60];
      const scale = Math.max(0.1, Math.min(1.4, width / (maxX - minX), height / (maxY - minY)));
      const transform = d3.zoomIdentity
        .translate(width / 2 - scale * (minX + maxX) / 2, height / 2 - scale * (minY + maxY) / 2)
        .scale(scale);
      (animate ? svg.transition().duration(400) : svg).call(zoom.transform as any, transform);
    };
    fit();
    fitRef.current = () => fit(true);

    svg.on('click', () => setCardId(null));

    return () => {
      simulation.stop();
    };
  }, [graphData, showAllLabels, centerId, onFocusPerson]);

  const card = cardId ? personMap[cardId] : undefined;
  const depthLabel = depth === null ? 'tout ce qui lui est relié' : depth === 1 ? 'proches immédiats' : `jusqu'à ${depth} liens de parenté`;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-3 text-stone-900 dark:text-stone-100">
      {/* En-tête et commandes */}
      <div className="bg-white dark:bg-[#1A1D24] border border-stone-200 dark:border-stone-800 rounded-2xl p-3 sm:p-4 shadow-2xs space-y-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-400 shrink-0">
            <Share2 className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-lg font-bold">Graphe des relations</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Centré sur <strong className="text-stone-800 dark:text-stone-200">{center?.name || '—'}</strong> ({depthLabel}) · {graphData.nodes.length} personne{graphData.nodes.length > 1 ? 's' : ''}.
              Touchez une personne pour recentrer le graphe sur elle.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex rounded-lg p-0.5 bg-stone-100 dark:bg-stone-800" role="group" aria-label="Étendue du graphe">
            {([1, 2, 3, null] as Depth[]).map(d => (
              <button
                key={String(d)}
                type="button"
                onClick={() => setDepth(d)}
                aria-pressed={depth === d}
                className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${depth === d ? 'bg-amber-900 text-white' : 'text-stone-600 dark:text-stone-300'}`}
                title={d === null ? 'Toutes les personnes reliées' : `Jusqu'à ${d} lien(s) de parenté`}
              >
                {d === null ? 'Tout' : d === 1 ? 'Proches' : `${d} liens`}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg p-0.5 bg-stone-100 dark:bg-stone-800" role="group" aria-label="Type de liens">
            {([['all', 'Tous liens'], ['parents', 'Filiations'], ['spouses', 'Unions']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setLinkFilter(value)}
                aria-pressed={linkFilter === value}
                className={`px-2.5 py-1 rounded-md cursor-pointer ${linkFilter === value ? 'bg-white dark:bg-stone-700 font-semibold shadow-xs' : 'text-stone-600 dark:text-stone-300'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {graphData.nodes.length > MAX_LABELLED_NODES && (
            <button
              type="button"
              onClick={() => setShowAllLabels(v => !v)}
              aria-pressed={showAllLabels}
              className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 cursor-pointer ${showAllLabels ? 'bg-stone-200 dark:bg-stone-700 border-stone-300' : 'border-stone-200 dark:border-stone-700'}`}
              title="Afficher le nom de toutes les personnes"
            >
              <Eye className="size-3.5" />
              <span>Tous les noms</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fitRef.current()}
            className="px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 flex items-center gap-1.5 cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-800"
            title="Afficher tout le graphe à l'écran"
          >
            <Maximize2 className="size-3.5" />
            <span>Ajuster</span>
          </button>
        </div>
      </div>

      {/* Zone de dessin : hauteur fixe pour que le graphe soit visible sur tous les écrans */}
      <div className="relative h-[65vh] min-h-[420px] rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-100/60 dark:bg-stone-950 overflow-hidden touch-none">
        <svg ref={svgRef} className="w-full h-full" role="img" aria-label={`Graphe des relations de ${center?.name || ''}`} />

        {/* Légende */}
        <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-white/90 dark:bg-stone-900/90 border border-stone-200 dark:border-stone-800 text-[10px] text-stone-600 dark:text-stone-400 flex flex-wrap items-center gap-x-3 gap-y-1 max-w-[calc(100%-1rem)]">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-blue-500" />Hommes</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-pink-500" />Femmes</span>
          <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-dashed border-amber-500" />Union</span>
          <span className="flex items-center gap-1"><span className="w-3 border-t-2 border-slate-400" />Filiation</span>
          <span>↑ ancêtres · descendants ↓</span>
        </div>

        {/* Personne touchée */}
        {card && (
          <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-sm flex items-center gap-3 p-3 rounded-xl bg-white/95 dark:bg-stone-900/95 border border-amber-300 dark:border-amber-800 shadow-lg">
            <span className={`size-3 rounded-full shrink-0 ${card.sex === 'M' ? 'bg-blue-500' : card.sex === 'F' ? 'bg-pink-500' : 'bg-violet-500'}`} />
            <div className="min-w-0 flex-1">
              <div className="font-serif text-sm font-bold truncate">{card.name}</div>
              <div className="text-[11px] font-mono text-stone-500">{lifeYears(card) || 'Dates non renseignées'}</div>
            </div>
            <button
              type="button"
              onClick={() => onOpenProfile(card.id)}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-950 text-white text-xs font-semibold cursor-pointer"
            >
              <span>Ouvrir la fiche</span>
              <ArrowRight className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setCardId(null)}
              aria-label="Fermer"
              className="shrink-0 p-1 rounded-md text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
