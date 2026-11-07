import React, { useState, useRef, useEffect } from 'react';
import { 
  User, Tag, Plus, X, Trash2, Edit2, ExternalLink, 
  Eye, EyeOff, Check, Search, Sparkles, MapPin, Calendar,
  Shield, Info, ZoomIn, ZoomOut, RotateCw, Contrast
} from 'lucide-react';
import { Search as LoupeIcon, Crop, UserCircle2, CheckCircle2 } from 'lucide-react';
import { boxFromCorners, hasFrame, portraitThumbnail } from '../lib/portrait';
import { ArchiveDocument, GenealogyData, Individual, PhotoTag } from '../types/genealogy';

interface PhotoTaggerProps {
  document: ArchiveDocument;
  data: GenealogyData;
  onUpdateTags: (tags: PhotoTag[]) => void;
  onSelectPerson: (personId: string) => void;
  readOnly?: boolean;
  /** Définit (tagId) ou retire (null) le portrait d'une personne à partir d'un visage cadré de cette photo */
  onSetPortrait?: (personId: string, tagId: string | null) => void;
}

/** Vignette d'un visage cadré (liste des personnes identifiées) */
const FaceThumb: React.FC<{ src: string; tag: PhotoTag }> = ({ src, tag }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    portraitThumbnail(src, { x: tag.x, y: tag.y, width: tag.width!, height: tag.height! }, 96)
      .then(u => { if (!cancelled) setUrl(u); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [src, tag.x, tag.y, tag.width, tag.height]);
  return url
    ? <img src={url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-stone-200" draggable={false} />
    : <span className="w-10 h-10 rounded-lg bg-stone-200 shrink-0" />;
};

export const PhotoTagger: React.FC<PhotoTaggerProps> = ({
  document,
  data,
  onUpdateTags,
  onSelectPerson,
  readOnly = false,
  onSetPortrait,
}) => {
  const [isTaggingMode, setIsTaggingMode] = useState<boolean>(false);
  const [showTags, setShowTags] = useState<boolean>(true);
  const [hoveredTagId, setHoveredTagId] = useState<string | null>(null);
  const [activeTagForEdit, setActiveTagForEdit] = useState<PhotoTag | null>(null);

  // New tag draft state
  const [newTagPosition, setNewTagPosition] = useState<{ x: number; y: number; width?: number; height?: number } | null>(null);
  // Cadre du visage : dessin en cours (coins en %) et recadrage d'un repère existant
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [reframing, setReframing] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [tagLabel, setTagLabel] = useState<string>('');
  const [personSearch, setPersonSearch] = useState<string>('');

  // Image viewer transform controls
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<'normal' | 'contrast' | 'invert' | 'grayscale'>('normal');

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Loupe : suit la souris (ou le doigt, au-dessus de lui) et grossit la zone survolée de l'image d'origine
  const [loupe, setLoupe] = useState(false);
  const [loupeZoom, setLoupeZoom] = useState(3);
  const [lens, setLens] = useState<{ x: number; y: number; w: number; h: number; touch: boolean } | null>(null);

  /** Position du pointeur dans l'image non transformée, en pixels (tient compte du zoom et de la rotation de la vue) */
  const toLocal = (clientX: number, clientY: number) => {
    const img = imageRef.current;
    if (!img) return null;
    const w = img.offsetWidth, h = img.offsetHeight;
    const r = img.getBoundingClientRect();
    const dx = (clientX - (r.left + r.width / 2)) / zoom;
    const dy = (clientY - (r.top + r.height / 2)) / zoom;
    const a = (-rotation * Math.PI) / 180;
    const x = dx * Math.cos(a) - dy * Math.sin(a) + w / 2;
    const y = dx * Math.sin(a) + dy * Math.cos(a) + h / 2;
    return { x, y, w, h, pctX: (x / w) * 100, pctY: (y / h) * 100 };
  };

  const moveLens = (clientX: number, clientY: number, touch: boolean) => {
    const p = toLocal(clientX, clientY);
    if (!p || p.x < 0 || p.y < 0 || p.x > p.w || p.y > p.h) {
      setLens(null);
      return;
    }
    setLens({ x: p.x, y: p.y, w: p.w, h: p.h, touch });
  };

  const imageFilter = filterMode === 'contrast'
    ? 'contrast(170%) brightness(95%)'
    : filterMode === 'invert'
      ? 'invert(100%) contrast(150%)'
      : filterMode === 'grayscale'
        ? 'grayscale(100%) contrast(130%)'
        : 'none';

  const tags = document.photoTags || [];

  // Filter people for the search dialog
  const filteredPeople = Object.values(data.individuals).filter(p => {
    if (!personSearch.trim()) return true;
    const q = personSearch.toLowerCase();
    const name = p.name.toLowerCase();
    const occ = p.occupations?.join(' ').toLowerCase() || '';
    const dates = `${p.birth?.date || ''} ${p.death?.date || ''}`.toLowerCase();
    return name.includes(q) || occ.includes(q) || dates.includes(q);
  }).slice(0, 8); // limit results for speed and clean UI

  // Marquage : un clic pose un repère, un glisser encadre le visage
  const openDraft = (pos: { x: number; y: number; width?: number; height?: number }) => {
    if (activeTagForEdit) {
      // Recadrage d'un repère existant : seule la géométrie change, la fiche reste ouverte
      setNewTagPosition(pos);
      setReframing(false);
      return;
    }
    setNewTagPosition(pos);
    setTagLabel('');
    setPersonSearch('');
    // Personne proposée par défaut : première personne liée pas encore identifiée, sinon la première de l'arbre
    const defaultP = document.linkedPersonIds?.find(id => !tags.some(t => t.personId === id)) || Object.keys(data.individuals)[0] || '';
    setSelectedPersonId(defaultP);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    if ((!isTaggingMode && !reframing) || readOnly || e.button !== 0) return;
    // Pendant la modification d'un repère, la photo ne sert qu'à redessiner son cadre (si demandé)
    if (activeTagForEdit && !reframing) return;
    const p = toLocal(e.clientX, e.clientY);
    if (!p) return;
    e.preventDefault();
    drawRef.current = { start: { x: p.pctX, y: p.pctY }, current: { x: p.pctX, y: p.pctY } };
    attachDrawListeners();
    setDrawStart({ x: p.pctX, y: p.pctY });
    setDrawCurrent({ x: p.pctX, y: p.pctY });
  };

  // Pendant le dessin, déplacement et relâchement sont suivis sur toute la fenêtre : le geste se termine
  // même si l'on relâche hors de la photo ou si l'image ne reçoit pas l'événement
  const drawRef = useRef<{ start: { x: number; y: number }; current: { x: number; y: number } } | null>(null);
  const finishDrawRef = useRef<(clientX?: number, clientY?: number) => void>(() => {});
  finishDrawRef.current = (clientX?: number, clientY?: number) => {
    const d = drawRef.current;
    if (!d) return;
    drawRef.current = null;
    const p = clientX !== undefined && clientY !== undefined ? toLocal(clientX, clientY) : null;
    const end = p ? { x: p.pctX, y: p.pctY } : d.current;
    const box = boxFromCorners(d.start.x, d.start.y, end.x, end.y);
    setDrawStart(null);
    setDrawCurrent(null);
    if (box.width >= 1.5 && box.height >= 1.5) {
      openDraft(box);
    } else if (!reframing) {
      // Simple clic : repère sans cadre (comportement d'origine)
      openDraft({ x: Math.max(2, Math.min(98, Math.round(box.x * 10) / 10)), y: Math.max(2, Math.min(98, Math.round(box.y * 10) / 10)) });
    }
  };
  const moveDrawRef = useRef<(clientX: number, clientY: number) => void>(() => {});
  moveDrawRef.current = (clientX: number, clientY: number) => {
    const d = drawRef.current;
    if (!d) return;
    const p = toLocal(clientX, clientY);
    if (!p) return;
    d.current = { x: p.pctX, y: p.pctY };
    setDrawCurrent(d.current);
  };

  // Écouteurs posés dès l'appui (et non après le rendu) : un geste très rapide n'est pas perdu
  const detachDrawListenersRef = useRef<(() => void) | null>(null);
  const attachDrawListeners = () => {
    detachDrawListenersRef.current?.();
    const onMove = (e: PointerEvent) => moveDrawRef.current(e.clientX, e.clientY);
    const onUp = (e: PointerEvent | MouseEvent) => { detach(); finishDrawRef.current(e.clientX, e.clientY); };
    const onCancel = () => { detach(); drawRef.current = null; setDrawStart(null); setDrawCurrent(null); };
    const detach = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      detachDrawListenersRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('pointercancel', onCancel);
    detachDrawListenersRef.current = detach;
  };
  useEffect(() => () => detachDrawListenersRef.current?.(), []);


  const handleSaveTag = () => {
    if (!selectedPersonId) return;

    const geometry = newTagPosition
      ? { x: newTagPosition.x, y: newTagPosition.y, width: newTagPosition.width, height: newTagPosition.height }
      : null;
    let savedTag: PhotoTag | null = null;
    if (activeTagForEdit) {
      // Modification d'un repère : personne, précision et cadre éventuellement redessiné
      const updated = tags.map(t => {
        if (t.id !== activeTagForEdit.id) return t;
        const { width, height, ...rest } = t;
        savedTag = {
          ...rest,
          ...(geometry || { x: t.x, y: t.y, width, height }),
          personId: selectedPersonId,
          label: tagLabel.trim() || undefined,
        };
        if (!savedTag.width || !savedTag.height) { delete savedTag.width; delete savedTag.height; }
        return savedTag;
      });
      onUpdateTags(updated);
      setActiveTagForEdit(null);
      setNewTagPosition(null);
    } else if (geometry) {
      savedTag = {
        id: 'tag-' + Date.now(),
        personId: selectedPersonId,
        x: geometry.x,
        y: geometry.y,
        ...(geometry.width && geometry.height ? { width: geometry.width, height: geometry.height } : {}),
        label: tagLabel.trim() || undefined,
        createdAt: Date.now(),
      };
      onUpdateTags([...tags, savedTag]);
      setNewTagPosition(null);
    }
    // Premier visage cadré d'une personne sans portrait : il devient son portrait
    const saved = savedTag as PhotoTag | null;
    if (saved && hasFrame(saved) && onSetPortrait && !data.individuals[saved.personId]?.portrait) {
      onSetPortrait(saved.personId, saved.id);
    }
    setReframing(false);
    setPersonSearch('');
    setTagLabel('');
  };

  const handleDeleteTag = (tagId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (confirm('Voulez-vous retirer cette identification de personne ?')) {
      const updated = tags.filter(t => t.id !== tagId);
      onUpdateTags(updated);
      if (hoveredTagId === tagId) setHoveredTagId(null);
      if (activeTagForEdit?.id === tagId) setActiveTagForEdit(null);
    }
  };

  const handleStartEditTag = (tag: PhotoTag, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveTagForEdit(tag);
    setSelectedPersonId(tag.personId);
    setTagLabel(tag.label || '');
    setNewTagPosition({ x: tag.x, y: tag.y, width: tag.width, height: tag.height });
    setReframing(false);
  };

  const closeForm = () => {
    setNewTagPosition(null);
    setActiveTagForEdit(null);
    setReframing(false);
  };

  return (
    <div className="space-y-4">
      
      {/* Top action bar: Tag mode, View mode, Zoom & filters */}
      <div className="bg-stone-100/90 border border-stone-200/90 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        
        {/* Left: Tagging mode buttons */}
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              onClick={() => {
                setIsTaggingMode(!isTaggingMode);
                setNewTagPosition(null);
                setActiveTagForEdit(null);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                isTaggingMode
                  ? 'bg-amber-900 text-white shadow-xs ring-2 ring-amber-600/50'
                  : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-50'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>{isTaggingMode ? 'Mode Marquage Actif' : 'Tagger une personne'}</span>
              {isTaggingMode && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
            </button>
          )}

          <button
            onClick={() => setShowTags(!showTags)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
              showTags 
                ? 'bg-white text-stone-800 border-stone-300' 
                : 'bg-stone-200/70 text-stone-500 border-stone-300'
            }`}
            title={showTags ? 'Masquer les étiquettes sur la photo' : 'Afficher les étiquettes'}
          >
            {showTags ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{showTags ? 'Étiquettes visibles' : 'Étiquettes masquées'}</span>
            <span className="font-mono text-[10px] bg-stone-100 text-stone-700 px-1.5 py-0.2 rounded font-bold">
              {tags.length}
            </span>
          </button>

          <button
            onClick={() => { setLoupe(v => !v); setLens(null); }}
            aria-pressed={loupe}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
              loupe ? 'bg-stone-800 text-white border-stone-800' : 'bg-white text-stone-800 border-stone-300'
            }`}
            title="Loupe : promenez la souris sur la photo pour grossir les visages"
          >
            <LoupeIcon className="w-3.5 h-3.5" />
            <span>{loupe ? 'Loupe activée' : 'Loupe'}</span>
          </button>
          {loupe && (
            <div className="flex items-center gap-0.5 bg-white p-0.5 rounded-lg border border-stone-200" role="group" aria-label="Grossissement de la loupe">
              {[2, 3, 4].map(z => (
                <button
                  key={z}
                  onClick={() => setLoupeZoom(z)}
                  aria-pressed={loupeZoom === z}
                  className={`px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${loupeZoom === z ? 'bg-stone-800 text-white' : 'text-stone-600 hover:bg-stone-100'}`}
                >
                  ×{z}
                </button>
              ))}
            </div>
          )}

          {isTaggingMode && (
            <span className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md font-medium hidden sm:inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-700" />
              <span>Cliquez sur un visage, ou glissez pour l'encadrer</span>
            </span>
          )}
        </div>

        {/* Right: Zoom & Image Controls */}
        <div className="flex items-center gap-1 bg-white border border-stone-200 p-1 rounded-lg text-stone-700">
          <button
            onClick={() => setZoom(z => Math.max(0.6, z - 0.2))}
            title="Zoom arrière"
            className="p-1 hover:bg-stone-100 rounded"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] px-1">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.min(2.5, z + 0.2))}
            title="Zoom avant"
            className="p-1 hover:bg-stone-100 rounded"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-3.5 bg-stone-200 mx-1" />

          <button
            onClick={() => setRotation(r => (r + 90) % 360)}
            title="Pivoter de 90°"
            className="p-1 hover:bg-stone-100 rounded"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-3.5 bg-stone-200 mx-1" />

          <button
            onClick={() => {
              const modes: Array<'normal' | 'contrast' | 'invert' | 'grayscale'> = ['normal', 'contrast', 'invert', 'grayscale'];
              const idx = modes.indexOf(filterMode);
              setFilterMode(modes[(idx + 1) % modes.length]);
            }}
            title="Mode de contraste d'archives"
            className={`p-1 hover:bg-stone-100 rounded flex items-center gap-1 ${filterMode !== 'normal' ? 'text-amber-800 font-bold' : ''}`}
          >
            <Contrast className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase font-mono">{filterMode}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Stage with Tag Pins and Tooltips */}
      <div 
        ref={containerRef}
        className="bg-stone-900 rounded-2xl overflow-hidden relative flex flex-col items-center justify-center p-3 select-none min-h-[380px]"
      >
        <div 
          className="relative inline-block transition-transform duration-150"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
          }}
          onMouseMove={loupe ? e => moveLens(e.clientX, e.clientY, false) : undefined}
          onMouseLeave={loupe ? () => setLens(null) : undefined}
          onTouchStart={loupe ? e => moveLens(e.touches[0].clientX, e.touches[0].clientY, true) : undefined}
          onTouchMove={loupe ? e => moveLens(e.touches[0].clientX, e.touches[0].clientY, true) : undefined}
          onTouchEnd={loupe ? () => setLens(null) : undefined}
        >
          {/* Main Image */}
          <img
            ref={imageRef}
            src={document.fileData}
            alt={document.title}
            onPointerDown={handlePointerDown}
            draggable={false}
            style={{ filter: imageFilter, ...(loupe || isTaggingMode || reframing ? { touchAction: 'none' } : {}) }}
            className={`max-h-[520px] w-auto object-contain rounded-lg shadow-2xl block transition-all ${
              isTaggingMode || reframing ? 'cursor-crosshair ring-2 ring-amber-500' : loupe ? 'cursor-none' : 'cursor-default'
            }`}
          />

          {/* Loupe : zone survolée grossie (image d'origine, même filtre), au-dessus des repères */}
          {loupe && lens && (() => {
            const size = (lens.touch ? 150 : 200) / zoom; // taille constante à l'écran malgré le zoom de la vue
            const left = lens.x - size / 2;
            const top = lens.touch ? lens.y - size - 24 / zoom : lens.y - size / 2;
            const targetX = size / 2;
            const targetY = size / 2;
            return (
              <div
                aria-hidden="true"
                className="absolute z-30 rounded-full shadow-2xl pointer-events-none bg-no-repeat"
                style={{
                  width: size,
                  height: size,
                  left,
                  top,
                  border: `${4 / zoom}px solid white`,
                  backgroundImage: `url("${document.fileData}")`,
                  backgroundSize: `${lens.w * loupeZoom}px ${lens.h * loupeZoom}px`,
                  backgroundPosition: `${targetX - lens.x * loupeZoom}px ${targetY - lens.y * loupeZoom}px`,
                  backgroundColor: '#1c1917',
                  // Fond positionné depuis le bord extérieur : le point visé tombe au centre malgré la bordure
                  backgroundOrigin: 'border-box',
                  filter: imageFilter,
                }}
              >
                <span
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-amber-500/60"
                  style={{ left: targetX - 4 / zoom, top: targetY - 4 / zoom, width: 8 / zoom, height: 8 / zoom }}
                />
              </div>
            );
          })()}

          {/* Cadre en cours de dessin */}
          {drawStart && drawCurrent && (() => {
            const b = boxFromCorners(drawStart.x, drawStart.y, drawCurrent.x, drawCurrent.y);
            return (
              <div
                className="absolute z-30 border-2 border-dashed border-amber-400 bg-amber-300/10 rounded-sm pointer-events-none"
                style={{ left: `${b.x - b.width / 2}%`, top: `${b.y - b.height / 2}%`, width: `${b.width}%`, height: `${b.height}%` }}
              />
            );
          })()}

          {/* Cadres des visages identifiés */}
          {showTags && tags.map(tag => hasFrame(tag) && data.individuals[tag.personId] ? (
            <div
              key={`frame-${tag.id}`}
              className={`absolute z-10 rounded-sm pointer-events-none transition-colors ${
                hoveredTagId === tag.id || activeTagForEdit?.id === tag.id ? 'border-2 border-amber-400' : 'border border-white/60'
              }`}
              style={{ left: `${tag.x - tag.width! / 2}%`, top: `${tag.y - tag.height! / 2}%`, width: `${tag.width}%`, height: `${tag.height}%` }}
            />
          ) : null)}

          {/* Render Photo Tags Overlay */}
          {showTags && tags.map((tag, idx) => {
            const person = data.individuals[tag.personId];
            if (!person) return null;

            const isHovered = hoveredTagId === tag.id;
            const isEditingThis = activeTagForEdit?.id === tag.id;
            // Visage cadré : le numéro se place sous le cadre pour ne pas couvrir le visage
            const pinY = hasFrame(tag) ? Math.min(98, tag.y + tag.height! / 2) : tag.y;

            return (
              <div
                key={tag.id}
                style={{
                  left: `${tag.x}%`,
                  top: `${pinY}%`,
                }}
                className={`absolute -translate-x-1/2 ${hasFrame(tag) ? 'translate-y-1' : '-translate-y-1/2'} z-20 group`}
                onMouseEnter={() => setHoveredTagId(tag.id)}
                onMouseLeave={() => setHoveredTagId(null)}
              >
                {/* Pin marker button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isTaggingMode) {
                      handleStartEditTag(tag, e);
                    } else {
                      onSelectPerson(tag.personId);
                    }
                  }}
                  className={`relative flex items-center justify-center w-7 h-7 rounded-full shadow-lg transition-transform duration-200 ${
                    isHovered || isEditingThis 
                      ? 'scale-125 ring-3 ring-amber-400 bg-amber-900 text-white z-30' 
                      : 'scale-100 bg-stone-900/80 backdrop-blur-xs text-amber-200 border-2 border-amber-300/80 hover:scale-110'
                  }`}
                  title={`${person.name} ${tag.label ? `(${tag.label})` : ''} - Cliquer pour ouvrir la fiche`}
                >
                  <span className="text-[11px] font-bold font-mono">
                    {idx + 1}
                  </span>

                  {/* Pulsing halo around marker */}
                  <span className="absolute -inset-1 rounded-full border border-amber-400/40 animate-ping pointer-events-none" />
                </button>

                {/* Floating Tooltip Card on Hover */}
                {isHovered && !newTagPosition && (
                  <div 
                    // Sous le repère pour ne pas masquer le visage ; au-dessus près du bas (la zone photo coupe ce qui dépasse)
                    className={`absolute ${pinY > 65 ? 'bottom-full mb-3' : 'top-full mt-3'} ${
                      tag.x < 20 ? 'left-0' : tag.x > 80 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    } w-64 bg-[#FBF9F5] text-stone-900 rounded-xl p-3 shadow-2xl border border-amber-800/20 z-40 text-left pointer-events-auto animate-in fade-in zoom-in-95 duration-150`}
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-stone-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${person.sex === 'M' ? 'bg-blue-600' : 'bg-rose-500'}`} />
                        <div>
                          <span className="font-serif text-xs font-bold text-stone-900 block leading-tight">
                            {person.name}
                          </span>
                          <span className="text-[10px] text-stone-500 font-mono">
                            {person.birth?.date ? `° ${person.birth.date}` : ''} {person.death?.date ? `+ ${person.death.date}` : ''}
                          </span>
                        </div>
                      </div>

                      {!readOnly && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => handleStartEditTag(tag, e)}
                            className="p-1 text-stone-400 hover:text-amber-800 hover:bg-stone-100 rounded"
                            title="Modifier ce tag"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteTag(tag.id, e)}
                            className="p-1 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                            title="Supprimer ce tag"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {tag.label && (
                      <p className="text-[11px] text-amber-950 font-medium italic mt-2 bg-amber-50/80 p-1.5 rounded border border-amber-200/60">
                        « {tag.label} »
                      </p>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPerson(tag.personId);
                      }}
                      className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-amber-900 hover:bg-amber-950 text-white rounded-lg text-[11px] font-medium shadow-xs transition-colors"
                    >
                      <User className="w-3 h-3" />
                      <span>Consulter la fiche généalogique</span>
                      <ExternalLink className="w-2.5 h-2.5 ml-auto opacity-70" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Cadre du brouillon (nouveau repère ou recadrage) */}
          {newTagPosition?.width && newTagPosition.height && !drawStart ? (
            <div
              className="absolute z-40 border-2 border-amber-500 bg-amber-300/10 rounded-sm pointer-events-none"
              style={{
                left: `${newTagPosition.x - newTagPosition.width / 2}%`,
                top: `${newTagPosition.y - newTagPosition.height / 2}%`,
                width: `${newTagPosition.width}%`,
                height: `${newTagPosition.height}%`,
              }}
            />
          ) : null}

          {/* New Tag Draft Pin & Inline Form Popover */}
          {newTagPosition && !newTagPosition.width && (
            <div
              style={{
                left: `${newTagPosition.x}%`,
                top: `${newTagPosition.y}%`,
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-auto"
            >
              {/* Draft Marker Pin */}
              <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center ring-4 ring-amber-300 animate-bounce shadow-xl">
                <Plus className="w-4 h-4" />
              </div>

            </div>
          )}

        </div>

        {/* Tagging Card Form — hors du conteneur zoomé/tourné, toujours entièrement visible dans la zone photo */}
        {newTagPosition && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 ${newTagPosition.x < 50 ? 'right-3' : 'left-3'} w-[min(20rem,calc(100%-1.5rem))] max-h-[calc(100%-1.5rem)] overflow-y-auto bg-white border border-stone-300 rounded-2xl shadow-2xl p-4 text-left z-50 animate-in fade-in zoom-in-95`}
          >
            <div className="flex items-center justify-between border-b border-stone-200 pb-2 mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                <Tag className="w-3.5 h-3.5 text-amber-800" />
                <span>{activeTagForEdit ? 'Modifier le tag' : 'Identifier une personne'}</span>
              </div>
              <button
                onClick={closeForm}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Person Search & Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Choisir une personne de l'arbre
                </label>

                {/* Search input */}
                <div className="relative mb-2">
                  <input
                    type="text"
                    value={personSearch}
                    onChange={e => setPersonSearch(e.target.value)}
                    placeholder="Rechercher par prénom, nom..."
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg pl-7 pr-2.5 py-1.5 text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2 top-2" />
                </div>

                {/* Quick suggestion list */}
                <div className="max-h-36 overflow-y-auto space-y-1 pr-1 border border-stone-100 rounded-lg p-1 bg-stone-50/50">
                  {filteredPeople.map(p => {
                    const isChosen = selectedPersonId === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setSelectedPersonId(p.id)}
                        className={`flex items-center justify-between p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                          isChosen 
                            ? 'bg-amber-100/90 text-amber-950 font-semibold ring-1 ring-amber-600' 
                            : 'hover:bg-white text-stone-700'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${p.sex === 'M' ? 'bg-blue-600' : 'bg-rose-500'}`} />
                          <span className="truncate">{p.name}</span>
                        </div>
                        <span className="text-[10px] text-stone-400 shrink-0 font-mono">
                          {p.birth?.date ? p.birth.date.slice(-4) : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Optional label / role description */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                  Précision ou rôle sur la photo <span className="font-normal text-stone-400">(facultatif)</span>
                </label>
                <input
                  type="text"
                  value={tagLabel}
                  onChange={e => setTagLabel(e.target.value)}
                  placeholder="Ex: Assis au 1er rang, Au bras de sa mère..."
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2 text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-800"
                />
              </div>

              {/* Cadre du visage */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {newTagPosition?.width ? (
                  <span className="inline-flex items-center gap-1 text-emerald-800"><Crop className="w-3 h-3" /> Visage cadré</span>
                ) : (
                  <span className="text-stone-500">Astuce : glissez sur la photo pour encadrer le visage (portrait).</span>
                )}
                {activeTagForEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => setReframing(true)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border ${reframing ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-stone-200 text-stone-700 hover:bg-stone-50'}`}
                    >
                      <Crop className="w-3 h-3" /> {newTagPosition?.width ? 'Redessiner le cadre' : 'Cadrer le visage'}
                    </button>
                    {newTagPosition?.width ? (
                      <button
                        type="button"
                        onClick={() => setNewTagPosition(pos => pos && { x: pos.x, y: pos.y })}
                        className="text-stone-500 hover:text-rose-700 hover:underline"
                      >
                        Retirer le cadre
                      </button>
                    ) : null}
                  </>
                )}
              </div>
              {reframing && (
                <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                  Dessinez un rectangle autour du visage sur la photo.
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSaveTag}
                  disabled={!selectedPersonId}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 disabled:opacity-40 rounded-lg shadow-sm"
                >
                  {activeTagForEdit ? 'Mettre à jour' : 'Enregistrer le tag'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Roster of identified individuals on this photograph */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-amber-800" />
            <h3 className="font-serif text-sm font-bold text-stone-900">
              Personnes identifiées sur ce document ({tags.length})
            </h3>
          </div>

          {!readOnly && (
            <button
              onClick={() => {
                setIsTaggingMode(true);
                // Prompt user to click on image
                const img = imageRef.current;
                if (img) {
                  img.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              className="text-xs text-amber-800 hover:text-amber-950 font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter une identification</span>
            </button>
          )}
        </div>

        {tags.length === 0 ? (
          <div className="p-4 text-center bg-stone-50 rounded-lg border border-dashed border-stone-200 text-xs text-stone-500">
            Aucun individu n'a encore été taggé sur cette photographie.
            {!readOnly && (
              <button
                onClick={() => setIsTaggingMode(true)}
                className="block mx-auto mt-1.5 text-amber-800 font-semibold hover:underline"
              >
                Activer le mode marquage et cliquer sur l'image
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2.5">
            {tags.map((tag, idx) => {
              const person = data.individuals[tag.personId];
              if (!person) return null;
              const isHovered = hoveredTagId === tag.id;

              return (
                <div
                  key={tag.id}
                  onMouseEnter={() => setHoveredTagId(tag.id)}
                  onMouseLeave={() => setHoveredTagId(null)}
                  className={`p-2.5 rounded-xl border transition-all text-left flex items-start justify-between gap-2 ${
                    isHovered 
                      ? 'bg-amber-50/90 border-amber-600 shadow-xs ring-1 ring-amber-600' 
                      : 'bg-stone-50/70 border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {hasFrame(tag) && document.fileData ? (
                      // Visage cadré : sa vignette, avec le numéro du repère en pastille
                      <span className="relative shrink-0">
                        <FaceThumb src={document.fileData} tag={tag} />
                        <span className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-amber-900 text-white font-mono text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                          {idx + 1}
                        </span>
                      </span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-amber-900 text-white font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${person.sex === 'M' ? 'bg-blue-600' : 'bg-rose-500'}`} />
                        <span className="font-serif text-xs font-semibold text-stone-900 truncate">
                          {person.name}
                        </span>
                      </div>

                      {tag.label ? (
                        <p className="text-[11px] text-amber-900 font-medium truncate mt-0.5">
                          {tag.label}
                        </p>
                      ) : (
                        <p className="text-[10px] text-stone-500 font-mono truncate mt-0.5">
                          {person.birth?.date || 'Dates non renseignées'}
                        </p>
                      )}

                      <button
                        onClick={() => onSelectPerson(person.id)}
                        className="mt-1.5 text-[10px] text-amber-800 hover:text-amber-950 hover:underline font-semibold flex items-center gap-1"
                      >
                        <User className="w-2.5 h-2.5" />
                        <span>Ouvrir sa fiche →</span>
                      </button>
                      {hasFrame(tag) && onSetPortrait && !readOnly && (
                        person.portrait?.archiveId === document.id && person.portrait.tagId === tag.id ? (
                          <span className="mt-1 text-[10px] text-emerald-800 font-semibold flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Portrait de la fiche
                            <button
                              onClick={() => onSetPortrait(person.id, null)}
                              className="ml-1 font-normal text-stone-500 hover:text-rose-700 hover:underline"
                              title="Ne plus utiliser ce visage comme portrait"
                            >
                              retirer
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => onSetPortrait(person.id, tag.id)}
                            className="mt-1 text-[10px] text-stone-600 hover:text-amber-900 hover:underline font-semibold flex items-center gap-1"
                          >
                            <UserCircle2 className="w-2.5 h-2.5" />
                            <span>Utiliser comme portrait</span>
                          </button>
                        )
                      )}
                      {!hasFrame(tag) && !readOnly && (
                        <button
                          onClick={(e) => { handleStartEditTag(tag, e); setReframing(true); imageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                          className="mt-1 text-[10px] text-stone-500 hover:text-amber-900 hover:underline flex items-center gap-1"
                        >
                          <Crop className="w-2.5 h-2.5" />
                          <span>Cadrer le visage</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {!readOnly && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={(e) => handleStartEditTag(tag, e)}
                        className="p-1 text-stone-400 hover:text-amber-800 rounded"
                        title="Modifier le libellé"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteTag(tag.id, e)}
                        className="p-1 text-stone-400 hover:text-rose-600 rounded"
                        title="Supprimer le tag"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
