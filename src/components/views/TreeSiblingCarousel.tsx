import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  GitFork,
  ArrowRight,
  Hand
} from 'lucide-react';
import type { Individual } from '../../types/genealogy';

interface TreeSiblingCarouselProps {
  currentPerson: Individual;
  siblings: Individual[];
  sosaMap: Record<string, number>;
  onSelectPerson: (id: string) => void;
  onViewProfile: (id: string) => void;
}

// Helper to extract numeric year from parsedDate or date string
function extractYear(ind: Individual): number | undefined {
  if (ind.birth?.parsedDate?.year) {
    return ind.birth.parsedDate.year;
  }
  if (ind.birth?.date) {
    const match = ind.birth.date.match(/\b(\d{4})\b/);
    if (match) return parseInt(match[1], 10);
  }
  return undefined;
}

export const TreeSiblingCarousel: React.FC<TreeSiblingCarouselProps> = ({
  currentPerson,
  siblings,
  sosaMap,
  onSelectPerson,
  onViewProfile,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse Drag state
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const currentYear = extractYear(currentPerson);

  // Update arrow buttons visibility
  const updateScrollBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 6);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    updateScrollBounds();
    el.addEventListener('scroll', updateScrollBounds, { passive: true });
    window.addEventListener('resize', updateScrollBounds);
    return () => {
      el.removeEventListener('scroll', updateScrollBounds);
      window.removeEventListener('resize', updateScrollBounds);
    };
  }, [updateScrollBounds, siblings.length]);

  // Mouse Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    setIsMouseDown(true);
    setStartX(e.pageX - container.offsetLeft);
    setScrollLeft(container.scrollLeft);
    setHasDragged(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown) return;
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.3;
    if (Math.abs(walk) > 5) {
      setHasDragged(true);
    }
    container.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsMouseDown(false);
    setTimeout(() => setHasDragged(false), 50);
  };

  const scrollByAmount = (offset: number) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollBy({ left: offset, behavior: 'smooth' });
  };

  if (!siblings || siblings.length === 0) return null;

  return (
    <div 
      data-testid="tree-sibling-carousel"
      className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-2.5 shadow-sm relative flex flex-col gap-2 max-w-xl md:max-w-2xl lg:max-w-3xl shrink-0"
    >
      {/* Mini top bar with count & controls */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-amber-950">
          <span className="font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse" />
            {`${siblings.length} frère${siblings.length > 1 ? 's' : ''} & sœur${siblings.length > 1 ? 's' : ''} à droite`}
          </span>
          <span className="text-amber-700/60 hidden sm:inline">·</span>
          <span className="text-stone-500 hidden sm:inline flex items-center gap-1">
            <Hand className="w-3 h-3 text-amber-800 inline" />
            Glissez avec souris ou doigt
          </span>
        </div>

        {/* Scroll arrow buttons */}
        <div className="flex items-center gap-1 bg-white/90 p-0.5 rounded-lg border border-amber-200/80 shadow-2xs">
          <button
            type="button"
            onClick={() => scrollByAmount(-240)}
            disabled={!canScrollLeft}
            className={`p-1 rounded transition-colors ${
              canScrollLeft 
                ? 'text-stone-700 hover:bg-amber-100 hover:text-amber-950 cursor-pointer' 
                : 'text-stone-300 cursor-not-allowed'
            }`}
            aria-label="Faire défiler la fratrie vers la gauche"
            title="Précédent"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => scrollByAmount(240)}
            disabled={!canScrollRight}
            className={`p-1 rounded transition-colors ${
              canScrollRight 
                ? 'text-stone-700 hover:bg-amber-100 hover:text-amber-950 cursor-pointer' 
                : 'text-stone-300 cursor-not-allowed'
            }`}
            aria-label="Faire défiler la fratrie vers la droite"
            title="Suivant"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Draggable container */}
      <div className="relative">
        {/* Soft edge fade shadows */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-amber-50 to-transparent z-10 pointer-events-none" />
        )}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-amber-50 to-transparent z-10 pointer-events-none" />
        )}

        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          className={`flex items-stretch gap-2.5 overflow-x-auto py-1 px-0.5 scrollbar-none select-none ${
            isMouseDown ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x pan-y',
            scrollBehavior: isMouseDown ? 'auto' : 'smooth',
          }}
        >
          {siblings.map((sib, index) => {
            const isMale = sib.sex === 'M';
            const isFemale = sib.sex === 'F';
            const sibYear = extractYear(sib);

            // Compute relative age tag
            let relativeLabel = '';
            if (currentYear !== undefined && sibYear !== undefined) {
              const diff = sibYear - currentYear;
              if (diff < 0) {
                relativeLabel = `${Math.abs(diff)} ans aîné${isFemale ? 'e' : ''}`;
              } else if (diff > 0) {
                relativeLabel = `${Math.abs(diff)} ans cadet${isFemale ? 'te' : ''}`;
              } else {
                relativeLabel = 'Même année';
              }
            }

            const sosa = sosaMap[sib.id] || sib.sosaNumber;

            return (
              <div
                key={sib.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!hasDragged) {
                    onSelectPerson(sib.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPerson(sib.id);
                  }
                }}
                className={`w-56 shrink-0 rounded-xl bg-white border border-stone-200 hover:border-amber-700 hover:bg-amber-50/40 p-3 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between group cursor-pointer text-left relative ${
                  isMale ? 'border-l-4 border-l-blue-400' : isFemale ? 'border-l-4 border-l-rose-400' : 'border-l-4 border-l-stone-300'
                }`}
                title="Cliquer pour centrer l'arbre sur cette personne"
              >
                <div>
                  {/* Top tags */}
                  <div className="flex items-center justify-between gap-1 mb-1.5 text-[10px] font-mono">
                    <span className="text-stone-500 font-semibold">
                      {isFemale ? 'Sœur' : 'Frère'} #{index + 1}
                    </span>

                    <div className="flex items-center gap-1">
                      {sosa && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-900 text-white font-bold text-[9px]">
                          {`Sosa ${sosa}`}
                        </span>
                      )}
                      {relativeLabel && (
                        <span className="text-stone-500 font-medium text-[9px] bg-stone-100 px-1 py-0.2 rounded">
                          {relativeLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Identity */}
                  <div className="flex items-start gap-2">
                    <div 
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-serif text-xs font-bold shrink-0 border ${
                        isMale 
                          ? 'bg-blue-50 text-blue-900 border-blue-200' 
                          : isFemale 
                            ? 'bg-rose-50 text-rose-900 border-rose-200' 
                            : 'bg-stone-50 text-stone-700 border-stone-200'
                      }`}
                    >
                      {sib.givenName?.[0] || sib.name[0]}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${isMale ? 'bg-blue-500' : 'bg-rose-400'}`} />
                        <h5 className="font-serif text-xs font-bold text-stone-900 group-hover:text-amber-950 truncate">
                          {sib.name}
                        </h5>
                      </div>

                      <div className="text-[10px] text-stone-500 font-mono mt-0.5 space-y-0.2">
                        {sib.birth?.date && (
                          <p className="truncate">
                            ° {sib.birth.date} {sib.birth.place ? `(${sib.birth.place.split(',')[0]})` : ''}
                          </p>
                        )}
                        {sib.death?.date && (
                          <p className="truncate text-stone-400">
                            † {sib.death.date}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions row */}
                <div className="mt-2.5 pt-1.5 border-t border-stone-100 flex items-center justify-between text-[10px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPerson(sib.id);
                    }}
                    className="font-medium text-amber-900 hover:text-amber-950 flex items-center gap-0.5 hover:underline cursor-pointer"
                    title="Mettre au centre de l'arbre"
                  >
                    <GitFork className="w-2.5 h-2.5 text-amber-800" />
                    <span>Racine arbre</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewProfile(sib.id);
                    }}
                    className="font-medium text-stone-500 hover:text-amber-900 flex items-center gap-0.5 hover:underline cursor-pointer"
                    title="Voir la fiche détaillée"
                  >
                    <span>Fiche</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
