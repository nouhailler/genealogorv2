import React, { useRef, useEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import type { Individual, Family } from '../../types/genealogy';
import { Share2, ZoomIn, ZoomOut, RotateCcw, Filter, Eye } from 'lucide-react';

interface Props {
  individuals: Record<string, Individual> | Map<string, Individual>;
  families: Record<string, Family> | Map<string, Family>;
  onSelectPerson: (id: string) => void;
  selectedPersonId?: string;
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  sex: 'M' | 'F' | 'X';
  year: number | null;
  person: Individual;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  kind: 'parent' | 'spouse';
}

function resolvePerson(id: string, individuals: Record<string, Individual> | Map<string, Individual>): Individual | undefined {
  if (individuals instanceof Map) return individuals.get(id);
  return individuals[id];
}

function getYear(p: Individual): number | null {
  if (p.birth?.parsedDate?.year) return p.birth.parsedDate.year;
  if (p.birth?.date) {
    const m = p.birth.date.match(/\b\d{4}\b/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

export const ForceGraphView: React.FC<Props> = ({
  individuals,
  families,
  onSelectPerson,
  selectedPersonId,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [linkFilter, setLinkFilter] = useState<'all' | 'parents' | 'spouses'>('all');
  const [showLabels, setShowLabels] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  const graphData = useMemo(() => {
    const personList = individuals instanceof Map ? Array.from(individuals.values()) : Object.values(individuals);
    const familyList = families instanceof Map ? Array.from(families.values()) : Object.values(families);

    const nodes: GraphNode[] = personList.map((p) => ({
      id: p.id,
      label: p.name,
      sex: p.sex,
      year: getYear(p),
      person: p,
    }));

    const idSet = new Set(nodes.map((n) => n.id));
    const links: GraphLink[] = [];

    // Spouse links
    if (linkFilter !== 'parents') {
      for (const f of familyList) {
        const hid = f.husbandId || (f as unknown as { husband?: string }).husband;
        const wid = f.wifeId || (f as unknown as { wife?: string }).wife;
        if (hid && wid && idSet.has(hid) && idSet.has(wid)) {
          links.push({ source: hid, target: wid, kind: 'spouse' });
        }
      }
    }

    // Parent-child links
    if (linkFilter !== 'spouses') {
      for (const f of familyList) {
        const hid = f.husbandId || (f as unknown as { husband?: string }).husband;
        const wid = f.wifeId || (f as unknown as { wife?: string }).wife;
        const cids = f.childrenIds || (f as unknown as { children?: string[] }).children || [];

        for (const cid of cids) {
          if (!idSet.has(cid)) continue;
          if (hid && idSet.has(hid)) {
            links.push({ source: hid, target: cid, kind: 'parent' });
          }
          if (wid && idSet.has(wid)) {
            links.push({ source: wid, target: cid, kind: 'parent' });
          }
        }
      }
    }

    return { nodes, links };
  }, [individuals, families, linkFilter]);

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 900;
    const height = svgRef.current.clientHeight || 650;

    const container = svg.append('g').attr('class', 'graph-container');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Deep copy nodes and links for simulation
    const simNodes: GraphNode[] = graphData.nodes.map((d) => ({ ...d }));
    const simLinks: GraphLink[] = graphData.links.map((d) => ({ ...d }));

    // Force simulation
    const simulation = d3.forceSimulation<GraphNode>(simNodes)
      .force(
        'link',
        d3.forceLink<GraphNode, GraphLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => (d.kind === 'spouse' ? 45 : 70)),
      )
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(24));

    simRef.current = simulation;

    // Render links
    const link = container.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(simLinks)
      .enter()
      .append('line')
      .attr('stroke', (d) => (d.kind === 'spouse' ? '#f59e0b' : '#94a3b8'))
      .attr('stroke-width', (d) => (d.kind === 'spouse' ? 2 : 1.2))
      .attr('stroke-dasharray', (d) => (d.kind === 'spouse' ? '4 2' : 'none'))
      .attr('stroke-opacity', 0.6);

    // Render nodes
    const node = container.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => onSelectPerson(d.id))
      .on('mouseenter', (_event, d) => setHoveredNode(d))
      .on('mouseleave', () => setHoveredNode(null));

    // Drag behavior
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag);

    // Node Circles
    node.append('circle')
      .attr('r', (d) => (d.id === selectedPersonId ? 14 : 10))
      .attr('fill', (d) => {
        if (d.id === selectedPersonId) return '#f59e0b';
        if (d.sex === 'M') return '#3b82f6';
        if (d.sex === 'F') return '#ec4899';
        return '#8b5cf6';
      })
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .attr('filter', 'drop-shadow(0 1px 2px rgba(0,0,0,0.15))');

    // Node Labels
    if (showLabels) {
      node.append('text')
        .text((d) => d.label.split(' ')[0])
        .attr('x', 14)
        .attr('y', 4)
        .attr('font-size', '11px')
        .attr('font-weight', '500')
        .attr('fill', 'currentColor')
        .attr('class', 'fill-stone-800 dark:fill-stone-200 select-none pointer-events-none');
    }

    // Tick update
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as GraphNode).x!)
        .attr('y1', (d) => (d.source as GraphNode).y!)
        .attr('x2', (d) => (d.target as GraphNode).x!)
        .attr('y2', (d) => (d.target as GraphNode).y!);

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, showLabels, selectedPersonId, onSelectPerson]);

  const handleResetZoom = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.transition().duration(500).call(
      d3.zoom<SVGSVGElement, unknown>().transform as any,
      d3.zoomIdentity,
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-50 dark:bg-stone-950 overflow-hidden text-stone-900 dark:text-stone-100">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
            <Share2 className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-stone-900 dark:text-white">
                Graphe Relationnel D3
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-900 dark:text-indigo-300 font-mono font-medium">
                {graphData.nodes.length} nœuds · {graphData.links.length} liens
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Simulation de physique interactive des liens de filiation et mariages
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Link Type Filter */}
          <div className="inline-flex rounded-lg border border-stone-200 dark:border-stone-800 p-0.5 bg-stone-100 dark:bg-stone-900 text-xs">
            <button
              onClick={() => setLinkFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                linkFilter === 'all'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-xs font-semibold'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              Tous liens
            </button>
            <button
              onClick={() => setLinkFilter('parents')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                linkFilter === 'parents'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-xs font-semibold'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              Filiations
            </button>
            <button
              onClick={() => setLinkFilter('spouses')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                linkFilter === 'spouses'
                  ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-white shadow-xs font-semibold'
                  : 'text-stone-600 dark:text-stone-400'
              }`}
            >
              Mariages
            </button>
          </div>

          <button
            onClick={() => setShowLabels((v) => !v)}
            className={`px-2.5 py-1 text-xs rounded-lg border transition-all flex items-center gap-1.5 ${
              showLabels
                ? 'bg-stone-200 dark:bg-stone-800 text-stone-900 dark:text-white border-stone-300 dark:border-stone-700'
                : 'bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 border-stone-200 dark:border-stone-800'
            }`}
          >
            <Eye className="size-3.5" />
            <span>Noms</span>
          </button>

          <button
            onClick={handleResetZoom}
            className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 shadow-xs"
            title="Recentrer le graphe"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      </div>

      {/* Graph Canvas */}
      <div className="flex-1 relative w-full h-full bg-stone-100/50 dark:bg-stone-950">
        {/* Floating Node Details Card */}
        {hoveredNode && (
          <div className="absolute top-4 left-4 z-20 px-3.5 py-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white/95 dark:bg-stone-900/95 shadow-lg backdrop-blur pointer-events-none max-w-xs animate-in fade-in duration-150">
            <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold">
              {hoveredNode.sex === 'M' ? 'Homme' : hoveredNode.sex === 'F' ? 'Femme' : 'Individu'}
            </div>
            <div className="text-sm font-semibold text-stone-900 dark:text-white">
              {hoveredNode.label}
            </div>
            <div className="text-xs text-stone-500 font-mono mt-0.5">
              {hoveredNode.year ? `Année : ${hoveredNode.year}` : 'Dates non précisées'}
            </div>
            <div className="text-[10px] text-stone-400 mt-1 italic">
              Cliquer pour ouvrir la fiche détaillée
            </div>
          </div>
        )}

        {/* Legend Overlay Bottom Left */}
        <div className="absolute bottom-4 left-4 z-10 px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-white/90 dark:bg-stone-900/90 shadow-xs backdrop-blur text-xs text-stone-600 dark:text-stone-400 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-blue-500" />
            <span>Hommes</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-pink-500" />
            <span>Femmes</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-amber-500 border-dashed" />
            <span>Mariage</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-slate-400" />
            <span>Filiation</span>
          </div>
        </div>

        <svg ref={svgRef} className="w-full h-full" />
      </div>
    </div>
  );
};
