import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  MapPin, Users, Calendar, Building, ChevronRight, Layers, 
  ZoomIn, ZoomOut, Compass, Search, Filter, Route, Sparkles, Eye
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GenealogyData, Individual } from '../../types/genealogy';
import { 
  resolveFrenchPlaceSync, 
  resolveFrenchPlaceAsync, 
  extractCommuneName, 
  GeoCoordinates 
} from '../../lib/france-geocoding';

interface GeoMapViewProps {
  data: GenealogyData;
  onSelectPerson: (id: string) => void;
}

export interface PlaceEvent {
  type: 'birth' | 'marriage' | 'death';
  personName: string;
  personId: string;
  year?: number;
  rawDate?: string;
}

export interface PlaceSummary {
  name: string;
  commune: string;
  count: number;
  events: PlaceEvent[];
  coords?: GeoCoordinates;
}

type MapTileStyle = 'osm' | 'positron' | 'topo';

const TILE_LAYERS: Record<MapTileStyle, { url: string; attribution: string; maxZoom: number; label: string }> = {
  osm: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributeurs',
    maxZoom: 19,
    label: 'OpenStreetMap Standard',
  },
  positron: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    label: 'Fond Clair (CartoDB)',
  },
  topo: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Données &copy; <a href="https://openstreetmap.org/copyright">OSM</a>, SRTM | Rendu &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
    label: 'Relief Topographique',
  },
};

export const GeoMapView: React.FC<GeoMapViewProps> = ({ data, onSelectPerson }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const migrationLayerRef = useRef<L.LayerGroup | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);

  const [selectedPlaceName, setSelectedPlaceName] = useState<string>('');
  const [tileStyle, setTileStyle] = useState<MapTileStyle>('osm');
  const [filterType, setFilterType] = useState<'all' | 'birth' | 'marriage' | 'death'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMigrations, setShowMigrations] = useState(true);
  const [geocodedPlaces, setGeocodedPlaces] = useState<Record<string, GeoCoordinates>>({});

  // 1. Extraction et consolidation des lieux de l'arbre
  const placesMap = useMemo(() => {
    const map: Record<string, PlaceSummary> = {};

    // Naissances et décès des individus
    for (const ind of Object.values(data.individuals || {})) {
      if (ind.birth?.place) {
        const place = ind.birth.place.trim();
        if (!map[place]) {
          map[place] = {
            name: place,
            commune: extractCommuneName(place),
            count: 0,
            events: [],
          };
        }
        map[place].count++;
        map[place].events.push({
          type: 'birth',
          personName: ind.name,
          personId: ind.id,
          year: ind.birth.parsedDate?.year,
          rawDate: ind.birth.date,
        });
      }

      if (ind.death?.place) {
        const place = ind.death.place.trim();
        if (!map[place]) {
          map[place] = {
            name: place,
            commune: extractCommuneName(place),
            count: 0,
            events: [],
          };
        }
        map[place].count++;
        map[place].events.push({
          type: 'death',
          personName: ind.name,
          personId: ind.id,
          year: ind.death.parsedDate?.year,
          rawDate: ind.death.date,
        });
      }
    }

    // Mariages dans les familles
    for (const fam of Object.values(data.families || {})) {
      if (fam.marriage?.place) {
        const place = fam.marriage.place.trim();
        const husb = fam.husbandId ? data.individuals[fam.husbandId] : undefined;
        const wife = fam.wifeId ? data.individuals[fam.wifeId] : undefined;
        const names = [husb?.name, wife?.name].filter(Boolean).join(' & ');

        if (!map[place]) {
          map[place] = {
            name: place,
            commune: extractCommuneName(place),
            count: 0,
            events: [],
          };
        }
        map[place].count++;
        map[place].events.push({
          type: 'marriage',
          personName: names || 'Union familiale',
          personId: husb?.id || wife?.id || '',
          year: fam.marriage.parsedDate?.year,
          rawDate: fam.marriage.date,
        });
      }
    }

    return map;
  }, [data]);

  // 2. Résolution synchrone et asynchrone des coordonnées pour chaque lieu
  useEffect(() => {
    let isMounted = true;
    const initialCoords: Record<string, GeoCoordinates> = {};

    // Résolution immédiate par dictionnaire local
    for (const [placeName] of Object.entries(placesMap)) {
      const syncCoord = resolveFrenchPlaceSync(placeName);
      if (syncCoord) {
        initialCoords[placeName] = syncCoord;
      }
    }
    setGeocodedPlaces(prev => ({ ...prev, ...initialCoords }));

    // Résolution asynchrone pour les communes non trouvées
    const asyncResolve = async () => {
      for (const [placeName] of Object.entries(placesMap)) {
        if (!initialCoords[placeName]) {
          const asyncCoord = await resolveFrenchPlaceAsync(placeName);
          if (asyncCoord && isMounted) {
            setGeocodedPlaces(prev => ({ ...prev, [placeName]: asyncCoord }));
          }
        }
      }
    };

    asyncResolve();

    return () => {
      isMounted = false;
    };
  }, [placesMap]);

  // Liste triée des lieux enrichis avec coordonnées
  const allPlaces = useMemo(() => {
    return Object.values(placesMap).map(p => ({
      ...p,
      coords: geocodedPlaces[p.name] || resolveFrenchPlaceSync(p.name) || undefined,
    })).sort((a, b) => b.count - a.count);
  }, [placesMap, geocodedPlaces]);

  // Lieux filtrés selon le filtre d'acte et la recherche textuelle
  const filteredPlaces = useMemo(() => {
    return allPlaces.filter(p => {
      const matchesSearch = searchQuery === '' || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.commune.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterType === 'all') return true;
      return p.events.some(ev => ev.type === filterType);
    });
  }, [allPlaces, searchQuery, filterType]);

  const activePlace = useMemo(() => {
    if (selectedPlaceName && placesMap[selectedPlaceName]) {
      return {
        ...placesMap[selectedPlaceName],
        coords: geocodedPlaces[selectedPlaceName] || resolveFrenchPlaceSync(selectedPlaceName) || undefined,
      };
    }
    return filteredPlaces[0] || allPlaces[0];
  }, [selectedPlaceName, placesMap, geocodedPlaces, filteredPlaces, allPlaces]);

  // 3. Initialisation de la carte Leaflet OpenStreetMap
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Centre géographique de la France métropolitaine
      const franceCenter: [number, number] = [46.603354, 1.888334];
      
      const map = L.map(mapContainerRef.current, {
        center: franceCenter,
        zoom: 6,
        minZoom: 4,
        maxZoom: 18,
        zoomControl: false, // Repositionné proprement en haut à droite
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      const layerConfig = TILE_LAYERS[tileStyle];
      const tileLayer = L.tileLayer(layerConfig.url, {
        attribution: layerConfig.attribution,
        maxZoom: layerConfig.maxZoom,
      }).addTo(map);

      currentTileLayerRef.current = tileLayer;

      const markersGroup = L.layerGroup().addTo(map);
      markersLayerRef.current = markersGroup;

      const migrationGroup = L.layerGroup().addTo(map);
      migrationLayerRef.current = migrationGroup;

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 4. Changement dynamique de couche cartographique (OSM / Positron / Topo)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (currentTileLayerRef.current) {
      map.removeLayer(currentTileLayerRef.current);
    }

    const layerConfig = TILE_LAYERS[tileStyle];
    const newTileLayer = L.tileLayer(layerConfig.url, {
      attribution: layerConfig.attribution,
      maxZoom: layerConfig.maxZoom,
    }).addTo(map);

    currentTileLayerRef.current = newTileLayer;
  }, [tileStyle]);

  // 5. Affichage des marqueurs OpenStreetMap et des lignes de migration
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersLayerRef.current;
    const migrationGroup = migrationLayerRef.current;
    if (!map || !markersGroup || !migrationGroup) return;

    markersGroup.clearLayers();
    migrationGroup.clearLayers();

    const validCoordinates: L.LatLngExpression[] = [];

    // Marqueurs des communes
    filteredPlaces.forEach(place => {
      const coords = place.coords;
      if (!coords) return;

      const latLng: [number, number] = [coords.lat, coords.lng];
      validCoordinates.push(latLng);

      const isSelected = activePlace && activePlace.name === place.name;

      // Calcul des proportions d'actes
      const birthsCount = place.events.filter(e => e.type === 'birth').length;
      const marriagesCount = place.events.filter(e => e.type === 'marriage').length;
      const deathsCount = place.events.filter(e => e.type === 'death').length;

      // Création d'une icône HTML personnalisée haute fidélité
      const customIcon = L.divIcon({
        className: 'custom-genealogy-marker',
        html: `
          <div style="position: relative; cursor: pointer; transform: translate(-50%, -100%);">
            <div style="
              display: flex;
              align-items: center;
              gap: 4px;
              padding: 4px 8px;
              background: ${isSelected ? '#78350f' : '#ffffff'};
              color: ${isSelected ? '#ffffff' : '#1c1917'};
              border: 2px solid ${isSelected ? '#d97706' : '#78350f'};
              border-radius: 9999px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.25);
              font-family: ui-sans-serif, system-ui, sans-serif;
              font-size: 11px;
              font-weight: 700;
              white-space: nowrap;
              transition: all 0.2s ease;
            ">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: ${isSelected ? '#fef3c7' : '#92400e'}">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>${place.commune}</span>
              <span style="
                background: ${isSelected ? '#d97706' : '#f5f5f4'};
                color: ${isSelected ? '#ffffff' : '#44403c'};
                padding: 1px 5px;
                border-radius: 9999px;
                font-size: 10px;
                font-family: ui-monospace, monospace;
              ">${place.count}</span>
            </div>
            <!-- Pin pointer needle -->
            <div style="
              width: 0; 
              height: 0; 
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 8px solid ${isSelected ? '#d97706' : '#78350f'};
              margin: 0 auto;
            "></div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker(latLng, { icon: customIcon });

      // Popup riche et interactif
      const popupContent = document.createElement('div');
      popupContent.className = 'font-sans text-xs p-1 space-y-2';
      popupContent.innerHTML = `
        <div style="border-bottom: 1px solid #e7e5e4; padding-bottom: 6px;">
          <div style="font-size: 9px; font-family: ui-monospace, monospace; text-transform: uppercase; color: #78350f; font-weight: 700;">
            ${coords.department ? `${coords.department} · ` : ''}Foyer Familial
          </div>
          <div style="font-size: 14px; font-weight: 700; font-family: serif; color: #1c1917; margin-top: 2px;">
            ${place.name}
          </div>
          <div style="font-size: 11px; color: #78716c; margin-top: 2px;">
            ${place.count} acte(s) répertorié(s) (${birthsCount} N, ${marriagesCount} M, ${deathsCount} D)
          </div>
        </div>
        <div style="max-height: 140px; overflow-y: auto; padding-right: 4px; display: flex; flex-direction: column; gap: 4px;">
          ${place.events.slice(0, 8).map(ev => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 3px 6px; background: #fafaf9; border-radius: 4px; border: 1px solid #f5f5f4;">
              <span style="font-weight: 600; color: #292524;">${ev.personName}</span>
              <span style="font-size: 10px; font-family: monospace; color: #78716c;">${ev.type.toUpperCase().slice(0, 1)} · ${ev.year || 's.d.'}</span>
            </div>
          `).join('')}
          ${place.events.length > 8 ? `<div style="font-size: 10px; color: #78350f; text-align: center; font-style: italic;">+ ${place.events.length - 8} autre(s) événement(s)</div>` : ''}
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 280, className: 'genealogor-popup' });

      marker.on('click', () => {
        setSelectedPlaceName(place.name);
      });

      marker.addTo(markersGroup);
    });

    // Tracé des lignes de flux migratoires entre générations familiales (ex: père -> enfant)
    if (showMigrations && Object.keys(data.individuals || {}).length > 0) {
      const drawnLinks = new Set<string>();

      for (const fam of Object.values(data.families || {})) {
        const husb = fam.husbandId ? data.individuals[fam.husbandId] : null;
        const husbPlace = husb?.birth?.place;
        const husbCoords = husbPlace ? (geocodedPlaces[husbPlace] || resolveFrenchPlaceSync(husbPlace)) : null;

        for (const childId of fam.childrenIds) {
          const child = data.individuals[childId];
          const childPlace = child?.birth?.place;
          const childCoords = childPlace ? (geocodedPlaces[childPlace] || resolveFrenchPlaceSync(childPlace)) : null;

          if (husbCoords && childCoords && (husbCoords.lat !== childCoords.lat || husbCoords.lng !== childCoords.lng)) {
            const linkKey = `${husbCoords.lat},${husbCoords.lng}->${childCoords.lat},${childCoords.lng}`;
            if (!drawnLinks.has(linkKey)) {
              drawnLinks.add(linkKey);

              const polyline = L.polyline(
                [[husbCoords.lat, husbCoords.lng], [childCoords.lat, childCoords.lng]],
                {
                  color: '#b45309',
                  weight: 2,
                  dashArray: '4, 8',
                  opacity: 0.65,
                }
              );

              polyline.bindTooltip(
                `Migration familiale : ${extractCommuneName(husbPlace || '')} → ${extractCommuneName(childPlace || '')}`,
                { sticky: true, className: 'text-[10px] font-sans' }
              );

              polyline.addTo(migrationGroup);
            }
          }
        }
      }
    }

    // Ajuster la vue si des coordonnées sont disponibles
    if (validCoordinates.length > 0) {
      const bounds = L.latLngBounds(validCoordinates);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [filteredPlaces, activePlace, showMigrations, data]);

  // 6. Centrer la carte lors de la sélection d'un lieu depuis la liste
  const handleSelectPlace = (place: PlaceSummary) => {
    setSelectedPlaceName(place.name);
    const coords = place.coords;
    const map = mapInstanceRef.current;
    if (coords && map) {
      map.flyTo([coords.lat, coords.lng], 12, { duration: 1.2 });
    }
  };

  const handleResetFranceView = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([46.603354, 1.888334], 6, { duration: 1 });
  };

  const handleFitAllAncestors = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const coords = filteredPlaces
      .map(p => p.coords)
      .filter((c): c is GeoCoordinates => Boolean(c))
      .map(c => [c.lat, c.lng] as [number, number]);

    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    } else {
      handleResetFranceView();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
      
      {/* Header bar */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] uppercase tracking-widest font-mono text-amber-800 font-bold block">
            GÉOGRAPHIE FAMILIALE & MIGRATIONS · OPENSTREETMAP
          </span>
          <h1 className="font-serif text-2xl font-bold text-stone-900 mt-0.5">
            Carte de France des Foyers & Paroisses
          </h1>
          <p className="text-xs text-stone-600 mt-0.5">
            Cartographie interactive OpenStreetMap des naissances, mariages et sépultures de votre lignée.
          </p>
        </div>

        {/* Quick Map Controls & Stats */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Style de carte */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200 text-xs">
            {(['osm', 'positron', 'topo'] as MapTileStyle[]).map(style => (
              <button
                key={style}
                onClick={() => setTileStyle(style)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  tileStyle === style
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {style === 'osm' ? 'Standard OSM' : style === 'positron' ? 'Clair' : 'Relief'}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowMigrations(!showMigrations)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
              showMigrations
                ? 'bg-amber-100/80 text-amber-900 border-amber-300'
                : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
            }`}
            title="Afficher les lignes de flux migratoires entre générations"
          >
            <Route className="w-3.5 h-3.5 text-amber-800" />
            <span className="hidden sm:inline">Flux migratoires</span>
          </button>

          <button
            onClick={handleFitAllAncestors}
            className="px-3 py-1.5 bg-amber-900 hover:bg-amber-950 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center gap-1.5"
            title="Recadrer sur tous les ancêtres"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Recadrer</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Interactive OSM Map (7 cols) + Places Sidebar & Events (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left / Top : Interactive OpenStreetMap Leaflet Container */}
        <div className="lg:col-span-7 space-y-3">
          <div className="relative bg-stone-100 border border-stone-300/80 rounded-2xl overflow-hidden shadow-sm h-[520px] md:h-[600px]">
            {/* Map Canvas */}
            <div ref={mapContainerRef} className="w-full h-full z-0" />

            {/* Floating Top Filter Bar on Map */}
            <div className="absolute top-3 left-3 z-[1000] flex flex-wrap items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-xl border border-stone-200/90 shadow-md text-xs">
              <span className="text-[10px] font-mono text-stone-400 px-1 font-bold">FILTRE :</span>
              {(['all', 'birth', 'marriage', 'death'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                    filterType === type
                      ? 'bg-amber-900 text-white shadow-2xs'
                      : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {type === 'all' ? 'Tous' : type === 'birth' ? 'Naissances' : type === 'marriage' ? 'Mariages' : 'Décès'}
                </button>
              ))}
            </div>

            {/* Floating Bottom Badge */}
            <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-stone-200/90 shadow-sm text-xs font-mono text-stone-600 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{filteredPlaces.length} commune(s) géolocalisée(s) en France</span>
            </div>

            {/* Quick France center shortcut */}
            <div className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5">
              <button
                onClick={handleResetFranceView}
                className="bg-white/95 hover:bg-white text-stone-800 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border border-stone-300 shadow-md backdrop-blur-md transition-all flex items-center gap-1"
              >
                <span>Vue France</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right / Bottom : Selected Place detail & Places browser (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Active Place Detail Card */}
          {activePlace ? (
            <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-2xs space-y-4">
              <div className="border-b border-stone-100 pb-3 flex items-start justify-between gap-2">
                <div>
                  <span className="text-[9px] uppercase font-mono tracking-widest text-amber-800 font-bold block">
                    COMMUNE SÉLECTIONNÉE
                  </span>
                  <h2 className="font-serif text-xl font-bold text-stone-900 mt-0.5">
                    {activePlace.name}
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {activePlace.coords?.department ? `${activePlace.coords.department} · ` : ''}
                    {activePlace.count} acte(s) d'état civil enregistrés
                  </p>
                </div>
                {activePlace.coords && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                    GPS OK
                  </span>
                )}
              </div>

              {/* Events list for active place */}
              <div className="space-y-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-stone-400 block">
                  Actes rattachés ({activePlace.events.length})
                </span>

                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {activePlace.events.map((ev, idx) => (
                    <div
                      key={idx}
                      onClick={() => ev.personId && onSelectPerson(ev.personId)}
                      className="p-2.5 rounded-xl border border-stone-200 hover:border-amber-700 hover:bg-amber-50/50 cursor-pointer transition-all flex items-center justify-between text-left group"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded font-bold ${
                              ev.type === 'birth'
                                ? 'bg-emerald-100 text-emerald-900'
                                : ev.type === 'marriage'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-rose-100 text-rose-900'
                            }`}
                          >
                            {ev.type === 'birth' ? 'N' : ev.type === 'marriage' ? 'M' : 'D'}
                          </span>
                          <span className="font-serif text-xs font-bold text-stone-900 group-hover:text-amber-900">
                            {ev.personName}
                          </span>
                        </div>
                        {ev.rawDate && (
                          <span className="text-[11px] font-mono text-stone-500 block">
                            {ev.rawDate}
                          </span>
                        )}
                      </div>

                      <span className="text-xs text-amber-800 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                        Voir fiche →
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-stone-200 text-xs text-stone-500">
              Cliquez sur un marqueur ou sélectionnez une commune pour afficher les détails.
            </div>
          )}

          {/* Communes Search & Browser list */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold font-serif text-stone-900">
                Toutes les communes ({filteredPlaces.length})
              </span>
              <span className="text-[10px] font-mono text-stone-500">
                Trier par fréquence
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
              <input
                type="text"
                placeholder="Rechercher une commune ou un département..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>

            {/* List */}
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {filteredPlaces.length === 0 ? (
                <div className="p-4 text-center text-xs text-stone-500">
                  Aucune commune ne correspond à la recherche.
                </div>
              ) : (
                filteredPlaces.map(place => {
                  const isSelected = activePlace && activePlace.name === place.name;
                  return (
                    <div
                      key={place.name}
                      onClick={() => handleSelectPlace(place)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between text-left ${
                        isSelected
                          ? 'bg-amber-50/90 border-amber-800 shadow-2xs ring-1 ring-amber-800'
                          : 'bg-white border-stone-200 hover:border-stone-400 hover:bg-stone-50/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-amber-800' : 'text-stone-400'}`} />
                        <div>
                          <span className="font-serif text-xs font-semibold text-stone-900 block">
                            {place.commune}
                          </span>
                          <span className="text-[10px] text-stone-500 block truncate max-w-[200px]">
                            {place.name.split(',').slice(1).join(',')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                          {place.count}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-stone-400" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
