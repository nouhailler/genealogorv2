import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPin, Search, Compass, Route, ChevronRight, Loader2, Baby, Heart, Cross, X } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GenealogyData } from '../../types/genealogy';
import { normalize as normalizeName } from '../../lib/place-gazetteer';
import {
  resolveFrenchPlaceSync,
  resolveFrenchPlaceAsync,
  parsePlace,
  GeoCoordinates,
} from '../../lib/france-geocoding';

interface GeoMapViewProps {
  data: GenealogyData;
  onSelectPerson: (id: string) => void;
}

type EventType = 'birth' | 'marriage' | 'death';
type FilterType = 'all' | EventType;
type MapTileStyle = 'positron' | 'osm' | 'topo';

export interface PlaceEvent {
  type: EventType;
  personName: string;
  personId: string;
  year?: number;
  rawDate?: string;
  /** Lieu tel qu'écrit dans l'arbre */
  rawPlace: string;
  /** Lieu-dit éventuel (« Bas Ribeyreix ») */
  hamlet?: string;
}

/** Commune localisée regroupant toutes les graphies et lieux-dits qui y renvoient */
interface Site {
  key: string;
  name: string;
  department?: string;
  coords: GeoCoordinates;
  hamlets: string[];
  events: PlaceEvent[];
}

const TILE_LAYERS: Record<MapTileStyle, { url: string; overlayUrl?: string; attribution: string; maxZoom: number; label: string }> = {
  // Fond gris clair Esri (sans clé) : les cercles ressortent ; noms de lieux sur une couche séparée.
  // (Le fond clair CARTO exige désormais une clé d'API.)
  positron: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    overlayUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Fond &copy; Esri, HERE, Garmin, &copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 16,
    label: 'Clair',
  },
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs',
    maxZoom: 19,
    label: 'Standard',
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Données &copy; <a href="https://openstreetmap.org/copyright">OSM</a>, SRTM | Rendu &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
    label: 'Relief',
  },
};

const FRANCE_CENTER: [number, number] = [46.603354, 1.888334];

const EVENT_LABELS: Record<EventType, { label: string; plural: string; icon: React.ElementType; badge: string }> = {
  birth: { label: 'Naissance', plural: 'Naissances', icon: Baby, badge: 'bg-emerald-100 text-emerald-900' },
  marriage: { label: 'Mariage', plural: 'Mariages', icon: Heart, badge: 'bg-amber-100 text-amber-900' },
  death: { label: 'Décès', plural: 'Décès', icon: Cross, badge: 'bg-rose-100 text-rose-900' },
};

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Point arrondi (≈ 100 m) */
const coordKey = (c: GeoCoordinates) => `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;

/**
 * Clé de regroupement d'une commune : nom officiel et département quand on les connaît
 * (les sources donnent des points légèrement différents pour une même commune), sinon le point.
 */
const siteKey = (c: GeoCoordinates) =>
  c.name ? `${normalizeName(c.name)}|${normalizeName(c.department || '')}` : coordKey(c);

const GEOCODING_CONCURRENCY = 6;

export const GeoMapView: React.FC<GeoMapViewProps> = ({ data, onSelectPerson }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const migrationLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const tileOverlayRef = useRef<L.TileLayer | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const [selectedKey, setSelectedKey] = useState<string>('');
  const [tileStyle, setTileStyle] = useState<MapTileStyle>('positron');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMigrations, setShowMigrations] = useState(false);
  /** Coordonnées par lieu brut ; null = recherché sans succès */
  const [geocoded, setGeocoded] = useState<Record<string, GeoCoordinates | null>>({});

  // 1. Événements datés et localisés de l'arbre, par lieu tel qu'écrit
  const eventsByRawPlace = useMemo(() => {
    const map: Record<string, PlaceEvent[]> = {};
    const add = (rawPlace: string | undefined, ev: Omit<PlaceEvent, 'rawPlace' | 'hamlet'>) => {
      const place = rawPlace?.trim();
      if (!place) return;
      (map[place] ||= []).push({ ...ev, rawPlace: place, hamlet: parsePlace(place).hamlet });
    };
    for (const ind of Object.values(data.individuals || {})) {
      add(ind.birth?.place, { type: 'birth', personName: ind.name, personId: ind.id, year: ind.birth?.parsedDate?.year, rawDate: ind.birth?.date });
      add(ind.death?.place, { type: 'death', personName: ind.name, personId: ind.id, year: ind.death?.parsedDate?.year, rawDate: ind.death?.date });
    }
    for (const fam of Object.values(data.families || {})) {
      const husb = fam.husbandId ? data.individuals[fam.husbandId] : undefined;
      const wife = fam.wifeId ? data.individuals[fam.wifeId] : undefined;
      add(fam.marriage?.place, {
        type: 'marriage',
        personName: [husb?.name, wife?.name].filter(Boolean).join(' & ') || 'Union',
        personId: husb?.id || wife?.id || '',
        year: fam.marriage?.parsedDate?.year,
        rawDate: fam.marriage?.date,
      });
    }
    return map;
  }, [data]);

  const rawPlaces = useMemo(() => Object.keys(eventsByRawPlace), [eventsByRawPlace]);

  // 2. Localisation : cache et dictionnaire immédiatement, puis API publiques (une requête à la fois)
  useEffect(() => {
    let cancelled = false;
    const initial: Record<string, GeoCoordinates | null> = {};
    for (const place of rawPlaces) {
      const sync = resolveFrenchPlaceSync(place);
      if (sync) initial[place] = sync;
    }
    setGeocoded(initial);

    // Plusieurs requêtes en parallèle, en nombre limité pour ménager les API publiques
    const queue = rawPlaces.filter(place => !initial[place]);
    const worker = async () => {
      while (!cancelled && queue.length > 0) {
        const place = queue.shift()!;
        const coords = await resolveFrenchPlaceAsync(place);
        if (!cancelled) setGeocoded(prev => ({ ...prev, [place]: coords }));
      }
    };
    for (let i = 0; i < GEOCODING_CONCURRENCY; i++) worker();
    return () => {
      cancelled = true;
    };
  }, [rawPlaces]);

  const pendingCount = rawPlaces.filter(p => !(p in geocoded)).length;
  const unlocatedPlaces = rawPlaces.filter(p => geocoded[p] === null);

  // 3. Regroupement par commune (même point), filtres type d'acte et recherche
  const sites = useMemo(() => {
    const byKey: Record<string, Site> = {};
    for (const place of rawPlaces) {
      const coords = geocoded[place];
      if (!coords) continue;
      const key = siteKey(coords);
      const site = (byKey[key] ||= {
        key,
        name: coords.name || parsePlace(place).commune,
        department: coords.department,
        coords,
        hamlets: [],
        events: [],
      });
      // Nom officiel renvoyé par les API de préférence à la graphie de l'arbre (« lyon » → « Lyon »)
      if (coords.source === 'osm_api' && coords.name) site.name = coords.name;
      const hamlet = parsePlace(place).hamlet;
      if (hamlet && !site.hamlets.some(h => h.toLowerCase() === hamlet.toLowerCase())) site.hamlets.push(hamlet);
      site.events.push(...eventsByRawPlace[place]);
    }
    for (const site of Object.values(byKey)) {
      site.events.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    }
    return Object.values(byKey);
  }, [rawPlaces, geocoded, eventsByRawPlace]);

  const matchesFilters = (site: Site) => {
    const q = searchQuery.trim().toLowerCase();
    if (q && !site.name.toLowerCase().includes(q) && !(site.department || '').toLowerCase().includes(q)
      && !site.hamlets.some(h => h.toLowerCase().includes(q))) return false;
    return filterType === 'all' || site.events.some(e => e.type === filterType);
  };
  const countFor = (site: Site) => site.events.filter(e => filterType === 'all' || e.type === filterType).length;

  const visibleSites = useMemo(
    () => sites.filter(matchesFilters).sort((a, b) => countFor(b) - countFor(a)),
    [sites, filterType, searchQuery]
  );
  const selectedSite = sites.find(s => s.key === selectedKey);
  const totalEvents = Object.values(eventsByRawPlace).reduce((n, list) => n + list.length, 0);

  // 4. Carte Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { center: FRANCE_CENTER, zoom: 6, minZoom: 3, maxZoom: 18, zoomControl: false });
    L.control.zoom({ position: 'topright' }).addTo(map);
    markersLayerRef.current = L.layerGroup().addTo(map);
    migrationLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    if (tileOverlayRef.current) map.removeLayer(tileOverlayRef.current);
    const cfg = TILE_LAYERS[tileStyle];
    tileLayerRef.current = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom }).addTo(map);
    tileOverlayRef.current = cfg.overlayUrl ? L.tileLayer(cfg.overlayUrl, { maxZoom: cfg.maxZoom }).addTo(map) : null;
  }, [tileStyle]);

  // Cadrage sur les communes visibles : à la fin de la localisation, au changement de filtre, et sur demande.
  // Jamais à la sélection d'une commune (la carte ne doit pas « sauter »).
  const fitToSites = (list: Site[] = visibleSites) => {
    const map = mapRef.current;
    if (!map) return;
    if (list.length === 0) {
      map.setView(FRANCE_CENTER, 6);
      return;
    }
    map.fitBounds(L.latLngBounds(list.map(s => [s.coords.lat, s.coords.lng] as [number, number])), { padding: [40, 40], maxZoom: 11 });
  };
  const locatingDone = rawPlaces.length > 0 && pendingCount === 0;
  useEffect(() => {
    if (locatingDone) fitToSites();
  }, [locatingDone, filterType, searchQuery]);

  // 5. Cercles proportionnels au nombre d'actes ; nom au survol et sur la commune sélectionnée
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const site of visibleSites) {
      const count = countFor(site);
      const isSelected = site.key === selectedKey;
      const marker = L.circleMarker([site.coords.lat, site.coords.lng], {
        radius: Math.min(26, 6 + Math.sqrt(count) * 3.2),
        color: isSelected ? '#451a03' : '#ffffff',
        weight: isSelected ? 3 : 1.5,
        fillColor: isSelected ? '#b45309' : '#92400e',
        fillOpacity: isSelected ? 0.95 : 0.7,
      });
      marker.bindTooltip(
        `<strong>${escapeHtml(site.name)}</strong> · ${count} acte${count > 1 ? 's' : ''}`,
        { direction: 'top', offset: [0, -6], permanent: isSelected, className: 'genealogor-map-label' }
      );
      marker.on('click', () => setSelectedKey(site.key));
      marker.addTo(layer);
      if (isSelected) marker.bringToFront();
    }
  }, [visibleSites, selectedKey, filterType]);

  // 6. Migrations (option) : du lieu de naissance du père à celui de l'enfant
  useEffect(() => {
    const layer = migrationLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showMigrations) return;
    const drawn = new Set<string>();
    for (const fam of Object.values(data.families || {})) {
      const fatherPlace = fam.husbandId ? data.individuals[fam.husbandId]?.birth?.place?.trim() : undefined;
      const from = fatherPlace ? geocoded[fatherPlace] : null;
      if (!from) continue;
      for (const childId of fam.childrenIds) {
        const childPlace = data.individuals[childId]?.birth?.place?.trim();
        const to = childPlace ? geocoded[childPlace] : null;
        if (!to || coordKey(from) === coordKey(to)) continue;
        const key = `${coordKey(from)}>${coordKey(to)}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
        L.polyline([[from.lat, from.lng], [to.lat, to.lng]], { color: '#b45309', weight: 2, dashArray: '4, 8', opacity: 0.6 })
          .bindTooltip(`${escapeHtml(from.name || '')} → ${escapeHtml(to.name || '')}`, { sticky: true })
          .addTo(layer);
      }
    }
  }, [showMigrations, geocoded, data]);

  const handleSelectFromList = (site: Site) => {
    setSelectedKey(site.key);
    mapRef.current?.flyTo([site.coords.lat, site.coords.lng], Math.max(mapRef.current.getZoom(), 10), { duration: 0.8 });
  };

  const selectedEvents = selectedSite
    ? selectedSite.events.filter(e => filterType === 'all' || e.type === filterType)
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-4">

      {/* En-tête et commandes */}
      <div className="bg-white dark:bg-[#1A1D24] border border-stone-200/90 dark:border-stone-800 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">Carte des lieux de la famille</h1>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-0.5">
              {sites.length} commune{sites.length > 1 ? 's' : ''} · {totalEvents} acte{totalEvents > 1 ? 's' : ''} (naissances, mariages, décès)
              {unlocatedPlaces.length > 0 && ` · ${unlocatedPlaces.length} lieu${unlocatedPlaces.length > 1 ? 'x' : ''} non localisé${unlocatedPlaces.length > 1 ? 's' : ''}`}
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-amber-800 dark:text-amber-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Localisation des lieux… {rawPlaces.length - pendingCount}/{rawPlaces.length}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-0.5 bg-stone-100 dark:bg-stone-800 rounded-xl text-xs" role="group" aria-label="Type d'acte">
            {(['all', 'birth', 'marriage', 'death'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setFilterType(type)}
                aria-pressed={filterType === type}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  filterType === type ? 'bg-amber-900 text-white' : 'text-stone-700 dark:text-stone-300 hover:text-stone-950'
                }`}
              >
                {type === 'all' ? 'Tous' : EVENT_LABELS[type].plural}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-stone-400" />
            <input
              type="text"
              placeholder="Commune, lieu-dit ou département…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-700"
            />
          </div>

          <button
            type="button"
            onClick={() => fitToSites()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-900 hover:bg-amber-950 text-white rounded-xl text-xs font-semibold cursor-pointer"
            title="Afficher toutes les communes"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Recadrer</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">

        {/* Carte */}
        <div className="lg:col-span-7">
          <div className="relative bg-stone-100 border border-stone-300/80 dark:border-stone-700 rounded-2xl overflow-hidden shadow-sm h-[420px] sm:h-[560px]">
            <div ref={mapContainerRef} className="w-full h-full z-0" />

            {/* Options d'affichage */}
            <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center bg-white/95 p-0.5 rounded-lg border border-stone-200 shadow-sm" role="group" aria-label="Fond de carte">
                {(['positron', 'osm', 'topo'] as MapTileStyle[]).map(style => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setTileStyle(style)}
                    aria-pressed={tileStyle === style}
                    className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer ${tileStyle === style ? 'bg-stone-800 text-white' : 'text-stone-700 hover:bg-stone-100'}`}
                  >
                    {TILE_LAYERS[style].label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 bg-white/95 px-2 py-1 rounded-lg border border-stone-200 shadow-sm text-stone-700 cursor-pointer select-none">
                <input type="checkbox" checked={showMigrations} onChange={e => setShowMigrations(e.target.checked)} className="h-3 w-3" />
                <Route className="w-3 h-3 text-amber-800" />
                <span>Migrations père → enfant</span>
              </label>
            </div>

            {/* Légende */}
            {/* Sur petit écran, laissée de côté quand une commune est sélectionnée (même emplacement) */}
            <div className={`absolute bottom-3 left-3 z-[1000] bg-white/95 px-2.5 py-1.5 rounded-lg border border-stone-200 shadow-sm text-[11px] text-stone-600 items-center gap-2 ${selectedSite ? 'hidden lg:flex' : 'flex'}`}>
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-800/70" />
              <span className="inline-block w-4 h-4 rounded-full bg-amber-800/70" />
              <span>Taille = nombre d'actes</span>
            </div>

            {/* Commune sélectionnée (rappel sur la carte) */}
            {selectedSite && (
              <div className="absolute bottom-3 right-3 z-[1000] max-w-[70%] flex items-center gap-2 bg-white/95 pl-3 pr-1 py-1 rounded-xl border border-amber-300 shadow-md text-xs">
                <span className="font-serif font-bold text-stone-900 truncate">{selectedSite.name}</span>
                <button
                  type="button"
                  onClick={() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="lg:hidden shrink-0 px-2 py-1 rounded-lg bg-amber-900 text-white font-semibold cursor-pointer"
                >
                  Voir les actes
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKey('')}
                  aria-label="Désélectionner"
                  className="shrink-0 p-1 rounded-md text-stone-500 hover:bg-stone-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Détail de la commune et liste */}
        <div className="lg:col-span-5 space-y-4">
          <div ref={detailRef} className="scroll-mt-32">
            {selectedSite ? (
              <div className="bg-white dark:bg-[#1A1D24] border border-amber-300 dark:border-amber-800 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
                <div>
                  <h2 className="font-serif text-xl font-bold text-stone-900 dark:text-stone-100">{selectedSite.name}</h2>
                  <p className="text-xs text-stone-500">
                    {selectedSite.department ? `${selectedSite.department} · ` : ''}
                    {selectedEvents.length} acte{selectedEvents.length > 1 ? 's' : ''}
                    {(['birth', 'marriage', 'death'] as EventType[]).map(t => {
                      const n = selectedSite.events.filter(e => e.type === t).length;
                      return n > 0 && filterType === 'all' ? ` · ${n} ${EVENT_LABELS[t].plural.toLowerCase()}` : '';
                    })}
                  </p>
                  {selectedSite.hamlets.length > 0 && (
                    <p className="text-[11px] text-stone-500 mt-1">
                      <span className="font-semibold">Lieux-dits :</span> {selectedSite.hamlets.join(', ')}
                    </p>
                  )}
                </div>

                <ul className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                  {selectedEvents.map((ev, idx) => {
                    const meta = EVENT_LABELS[ev.type];
                    return (
                      <li key={idx}>
                        <button
                          type="button"
                          onClick={() => ev.personId && onSelectPerson(ev.personId)}
                          className="w-full flex items-center gap-2 p-2 rounded-lg border border-stone-200 dark:border-stone-700 hover:border-amber-700 hover:bg-amber-50/60 dark:hover:bg-amber-950/30 text-left cursor-pointer"
                          title="Ouvrir la fiche"
                        >
                          <span className={`shrink-0 text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded ${meta.badge}`}>{meta.label}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-serif text-xs font-bold text-stone-900 dark:text-stone-100 truncate">{ev.personName}</span>
                            {ev.hamlet && <span className="block text-[10px] text-stone-500 truncate">{ev.hamlet}</span>}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-stone-500">{ev.rawDate || ev.year || 's.d.'}</span>
                          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-stone-400" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="p-5 text-center bg-white dark:bg-[#1A1D24] rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 text-xs text-stone-500">
                Touchez un cercle sur la carte ou une commune ci-dessous pour voir les naissances, mariages et décès qui s'y sont produits.
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#1A1D24] border border-stone-200 dark:border-stone-800 rounded-2xl p-4 shadow-2xs space-y-2">
            <span className="text-xs font-bold font-serif text-stone-900 dark:text-stone-100 block">
              Communes ({visibleSites.length}) · par nombre d'actes
            </span>
            <ul className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
              {visibleSites.length === 0 && (
                <li className="p-3 text-center text-xs text-stone-500">
                  {pendingCount > 0 ? 'Localisation en cours…' : 'Aucune commune ne correspond.'}
                </li>
              )}
              {visibleSites.map(site => {
                const isSelected = site.key === selectedKey;
                return (
                  <li key={site.key}>
                    <button
                      type="button"
                      onClick={() => handleSelectFromList(site)}
                      className={`w-full p-2 rounded-lg border flex items-center justify-between gap-2 text-left cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-amber-50 border-amber-800 ring-1 ring-amber-800 dark:bg-amber-950/40'
                          : 'border-stone-200 dark:border-stone-700 hover:border-stone-400'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <MapPin className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-amber-800' : 'text-stone-400'}`} />
                        <span className="min-w-0">
                          <span className="block font-serif text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">{site.name}</span>
                          {site.department && <span className="block text-[10px] text-stone-500">{site.department}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                        {countFor(site)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {unlocatedPlaces.length > 0 && pendingCount === 0 && (
              <details className="text-[11px] text-stone-500 pt-1">
                <summary className="cursor-pointer font-semibold">
                  {unlocatedPlaces.length} lieu{unlocatedPlaces.length > 1 ? 'x' : ''} non localisé{unlocatedPlaces.length > 1 ? 's' : ''}
                </summary>
                <ul className="mt-1 space-y-0.5 pl-3 list-disc">
                  {unlocatedPlaces.map(p => (
                    <li key={p}>{p} ({eventsByRawPlace[p].length} acte{eventsByRawPlace[p].length > 1 ? 's' : ''})</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
