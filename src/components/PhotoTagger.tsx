import React, { useState, useRef, useEffect } from 'react';
import { 
  User, Tag, Plus, X, Trash2, Edit2, ExternalLink, 
  Eye, EyeOff, Check, Search, Sparkles, MapPin, Calendar,
  Shield, Info, ZoomIn, ZoomOut, RotateCw, Contrast
} from 'lucide-react';
import { ArchiveDocument, GenealogyData, Individual, PhotoTag } from '../types/genealogy';

interface PhotoTaggerProps {
  document: ArchiveDocument;
  data: GenealogyData;
  onUpdateTags: (tags: PhotoTag[]) => void;
  onSelectPerson: (personId: string) => void;
  readOnly?: boolean;
}

export const PhotoTagger: React.FC<PhotoTaggerProps> = ({
  document,
  data,
  onUpdateTags,
  onSelectPerson,
  readOnly = false,
}) => {
  const [isTaggingMode, setIsTaggingMode] = useState<boolean>(false);
  const [showTags, setShowTags] = useState<boolean>(true);
  const [hoveredTagId, setHoveredTagId] = useState<string | null>(null);
  const [activeTagForEdit, setActiveTagForEdit] = useState<PhotoTag | null>(null);

  // New tag draft state
  const [newTagPosition, setNewTagPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [tagLabel, setTagLabel] = useState<string>('');
  const [personSearch, setPersonSearch] = useState<string>('');

  // Image viewer transform controls
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<'normal' | 'contrast' | 'invert' | 'grayscale'>('normal');

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Handle clicking on image to create a tag
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isTaggingMode || readOnly) return;

    const img = imageRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert to percentage (0 - 100)
    const pctX = Math.round((clickX / rect.width) * 1000) / 10;
    const pctY = Math.round((clickY / rect.height) * 1000) / 10;

    // Constrain to 0-100%
    const clampedX = Math.max(2, Math.min(98, pctX));
    const clampedY = Math.max(2, Math.min(98, pctY));

    setNewTagPosition({ x: clampedX, y: clampedY });
    setActiveTagForEdit(null);
    setTagLabel('');
    setPersonSearch('');
    // Default selected person: first linked person or first in tree
    const defaultP = document.linkedPersonIds?.find(id => !tags.some(t => t.personId === id)) || Object.keys(data.individuals)[0] || '';
    setSelectedPersonId(defaultP);
  };

  const handleSaveTag = () => {
    if (!selectedPersonId) return;

    if (activeTagForEdit) {
      // Editing existing tag
      const updated = tags.map(t => 
        t.id === activeTagForEdit.id 
          ? { ...t, personId: selectedPersonId, label: tagLabel.trim() || undefined }
          : t
      );
      onUpdateTags(updated);
      setActiveTagForEdit(null);
    } else if (newTagPosition) {
      // Creating new tag
      const newTag: PhotoTag = {
        id: 'tag-' + Date.now(),
        personId: selectedPersonId,
        x: newTagPosition.x,
        y: newTagPosition.y,
        label: tagLabel.trim() || undefined,
        createdAt: Date.now(),
      };
      onUpdateTags([...tags, newTag]);
      setNewTagPosition(null);
    }
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
    setNewTagPosition({ x: tag.x, y: tag.y });
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

          {isTaggingMode && (
            <span className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md font-medium hidden sm:inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-700" />
              <span>Cliquez sur un visage ou une personne pour l'identifier</span>
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
        >
          {/* Main Image */}
          <img
            ref={imageRef}
            src={document.fileData}
            alt={document.title}
            onClick={handleImageClick}
            style={{
              filter: filterMode === 'contrast'
                ? 'contrast(170%) brightness(95%)'
                : filterMode === 'invert'
                  ? 'invert(100%) contrast(150%)'
                  : filterMode === 'grayscale'
                    ? 'grayscale(100%) contrast(130%)'
                    : 'none',
            }}
            className={`max-h-[520px] w-auto object-contain rounded-lg shadow-2xl block transition-all ${
              isTaggingMode ? 'cursor-crosshair ring-2 ring-amber-500' : 'cursor-default'
            }`}
          />

          {/* Render Photo Tags Overlay */}
          {showTags && tags.map((tag, idx) => {
            const person = data.individuals[tag.personId];
            if (!person) return null;

            const isHovered = hoveredTagId === tag.id;
            const isEditingThis = activeTagForEdit?.id === tag.id;

            return (
              <div
                key={tag.id}
                style={{
                  left: `${tag.x}%`,
                  top: `${tag.y}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 group"
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
                    className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-64 bg-[#FBF9F5] text-stone-900 rounded-xl p-3 shadow-2xl border border-amber-800/20 z-40 text-left pointer-events-auto animate-in fade-in zoom-in-95 duration-150`}
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

          {/* New Tag Draft Pin & Inline Form Popover */}
          {newTagPosition && (
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

              {/* Tagging Card Form */}
              <div className="absolute top-full mt-3 left-1/2 -translate-x-1/2 w-80 bg-white border border-stone-300 rounded-2xl shadow-2xl p-4 text-left z-50 animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-stone-200 pb-2 mb-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                    <Tag className="w-3.5 h-3.5 text-amber-800" />
                    <span>{activeTagForEdit ? 'Modifier le tag' : 'Identifier une personne'}</span>
                  </div>
                  <button
                    onClick={() => {
                      setNewTagPosition(null);
                      setActiveTagForEdit(null);
                    }}
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

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => {
                        setNewTagPosition(null);
                        setActiveTagForEdit(null);
                      }}
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
            </div>
          )}

        </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
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
                    <span className="w-5 h-5 rounded-full bg-amber-900 text-white font-mono text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>

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
