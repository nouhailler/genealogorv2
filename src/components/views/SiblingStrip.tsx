import React, { useRef, useState, useEffect, useCallback } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Sparkles, 
  ArrowLeftRight,
  Maximize2
} from 'lucide-react';
import type { Individual, GenealogyData } from '../../types/genealogy';

interface SiblingStripProps {
  person: Individual;
  data: GenealogyData;
  sosaMap: Record<string, number>;
  onSelectPerson: (id: string) => void;
}

interface SiblingItem {
  individual: Individual;
  isCurrent: boolean;
  birthYear?: number;
  birthDateStr: string;
  deathDateStr: string;
  relativeOrder: 'older' | 'younger' | 'same_date' | 'current';
  ageDiffYears?: number;
  orderIndex: number; // 1-based index in the fratrie
  isFirst: boolean;
  isLast: boolean;
  sosa?: number;
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

// Helper to get sortable timestamp for child
function getBirthSortKey(ind: Individual, defaultIndex: number): number {
  const p = ind.birth?.parsedDate;
  if (p?.year) {
    return p.year * 10000 + (p.month || 1) * 100 + (p.day || 1);
  }
  const year = extractYear(ind);
  if (year) return year * 10000;
  // Fall back to large stable key based on GEDCOM child order
  return 99990000 + defaultIndex;
}

export const SiblingStrip: React.FC<SiblingStripProps> = ({
  person,
  data,
  sosaMap,
  onSelectPerson,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);

  // Drag state for mouse interaction
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasDragged, setHasDragged] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // 1. Gather all siblings across person's parent families (including current person)
  const allSiblingIds = new Set<string>();
  const parentFamilyIds = person.familiesAsChild || [];

  for (const famId of parentFamilyIds) {
    const fam = data.families[famId];
    if (fam && fam.childrenIds) {
      fam.childrenIds.forEach(id => {
        if (data.individuals[id]) {
          allSiblingIds.add(id);
        }
      });
    }
  }

  // Ensure current person is included in the sibling set
  allSiblingIds.add(person.id);

  // Build sibling list
  const rawList = Array.from(allSiblingIds)
    .map(id => data.individuals[id])
    .filter((ind): ind is Individual => Boolean(ind));

  // Sort chronologically (oldest on the left, youngest on the right)
  const sortedSiblings = [...rawList].sort((a, b) => {
    const keyA = getBirthSortKey(a, rawList.indexOf(a));
    const keyB = getBirthSortKey(b, rawList.indexOf(b));
    return keyA - keyB;
  });

  const personYear = extractYear(person);
  const totalCount = sortedSiblings.length;
  const currentPersonIndex = sortedSiblings.findIndex(s => s.id === person.id);

  const siblingItems: SiblingItem[] = sortedSiblings.map((ind, idx) => {
    const isCurrent = ind.id === person.id;
    const year = extractYear(ind);
    let relativeOrder: SiblingItem['relativeOrder'] = 'current';
    let ageDiffYears: number | undefined = undefined;

    if (!isCurrent) {
      if (personYear !== undefined && year !== undefined) {
        ageDiffYears = year - personYear;
        if (ageDiffYears < 0) {
          relativeOrder = 'older';
        } else if (ageDiffYears > 0) {
          relativeOrder = 'younger';
        } else {
          relativeOrder = 'same_date';
        }
      } else {
        // Fall back to index in sorted array
        relativeOrder = idx < currentPersonIndex ? 'older' : 'younger';
      }
    }

    return {
      individual: ind,
      isCurrent,
      birthYear: year,
      birthDateStr: ind.birth?.date || '',
      deathDateStr: ind.death?.date || '',
      relativeOrder,
      ageDiffYears,
      orderIndex: idx + 1,
      isFirst: idx === 0,
      isLast: idx === totalCount - 1,
      sosa: sosaMap[ind.id] || ind.sosaNumber,
    };
  });

  const olderCount = siblingItems.filter(s => s.relativeOrder === 'older').length;
  const youngerCount = siblingItems.filter(s => s.relativeOrder === 'younger').length;

  // Update scroll buttons visibility
  const updateScrollBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  // Center the active person's card smoothly
  const centerActivePerson = useCallback((smooth = true) => {
    const container = containerRef.current;
    const card = activeCardRef.current;
    if (!container || !card) return;

    const containerWidth = container.clientWidth;
    const cardLeft = card.offsetLeft;
    const cardWidth = card.clientWidth;

    const targetScroll = cardLeft - (containerWidth / 2) + (cardWidth / 2);
    container.scrollTo({
      left: Math.max(0, targetScroll),
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // Center active person on mount or when person changes
  useEffect(() => {
    const timer = setTimeout(() => {
      centerActivePerson(true);
      updateScrollBounds();
    }, 120);
    return () => clearTimeout(timer);
  }, [person.id, centerActivePerson, updateScrollBounds]);

  // Listen to scroll events to update arrows
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
  }, [updateScrollBounds]);

  // Mouse Drag handlers
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
    const walk = (x - startX) * 1.3; // Speed multiplier for smooth feel
    if (Math.abs(walk) > 5) {
      setHasDragged(true);
    }
    container.scrollLeft = scrollLeft - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsMouseDown(false);
    // hasDragged remains true briefly if we dragged, preventing accidental click
    setTimeout(() => setHasDragged(false), 50);
  };

  // Chevron navigation
  const scrollByAmount = (offset: number) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollBy({ left: offset, behavior: 'smooth' });
  };

  // If there are no siblings at all (person is an only child in data)
  if (totalCount <= 1) {
    return (
      <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 md:p-5 text-stone-600 shadow-2xs">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-stone-200/70 text-stone-700 rounded-xl">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-sm font-bold text-stone-900">
                Fratrie · Enfant unique répertorié
              </h3>
              <p className="text-xs text-stone-500">
                Aucun frère ni sœur n'est actuellement rattaché aux parents de {person.name}.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section 
      aria-label="Fratrie sur le même plan horizontal"
      className="bg-white border border-stone-200/90 rounded-2xl p-4 md:p-6 shadow-sm space-y-4 relative overflow-hidden"
    >
      {/* Background soft ambient accents */}
      <div className="absolute top-0 left-0 w-36 h-36 bg-blue-50/40 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-0 right-0 w-36 h-36 bg-rose-50/40 rounded-full blur-2xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-900">
              <ArrowLeftRight className="w-4 h-4" />
            </span>
            <h2 className="font-serif text-base md:text-lg font-bold text-stone-900">
              Fratrie · Frères & Sœurs sur le même plan
            </h2>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-100/90 text-amber-900 border border-amber-200">
              {`${totalCount} enfants`}
            </span>
          </div>

          <p className="text-xs text-stone-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>
              {`← ${olderCount} aîné${olderCount > 1 ? 's' : ''} à gauche`}
            </span>
            <span>·</span>
            <span className="font-semibold text-amber-950 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
              {`${person.givenName || person.name} au centre`}
            </span>
            <span>·</span>
            <span>
              {`${youngerCount} cadet${youngerCount > 1 ? 's' : ''} à droite →`}
            </span>
          </p>
        </div>

        {/* Controls: Center button & Arrow Chevrons */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => centerActivePerson(true)}
            className="px-2.5 py-1 text-xs font-medium text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
            title="Recentrer sur la personne consultée"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Recentrer</span>
          </button>

          <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
            <button
              type="button"
              onClick={() => scrollByAmount(-280)}
              disabled={!canScrollLeft}
              className={`p-1.5 rounded-md transition-all ${
                canScrollLeft 
                  ? 'text-stone-700 hover:bg-white hover:shadow-2xs cursor-pointer' 
                  : 'text-stone-300 cursor-not-allowed'
              }`}
              aria-label="Faire défiler vers les frères et sœurs aînés (gauche)"
              title="Faire défiler vers la gauche"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => scrollByAmount(280)}
              disabled={!canScrollRight}
              className={`p-1.5 rounded-md transition-all ${
                canScrollRight 
                  ? 'text-stone-700 hover:bg-white hover:shadow-2xs cursor-pointer' 
                  : 'text-stone-300 cursor-not-allowed'
              }`}
              aria-label="Faire défiler vers les frères et sœurs cadets (droite)"
              title="Faire défiler vers la droite"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Helpful gesture tooltip */}
      <div className="text-[11px] text-stone-500 flex items-center justify-between border-t border-stone-100 pt-2 font-mono">
        <span className="flex items-center gap-1">
          <span className="text-amber-800">🖐</span>
          <span>Déplacez avec la souris ou le doigt (glisser horizontalement)</span>
        </span>
        <span className="hidden sm:inline text-stone-400">
          Ordre chronologique de naissance de gauche à droite
        </span>
      </div>

      {/* The Draggable / Swipeable Horizontal Plane */}
      <div className="relative">
        {/* Soft edge blur gradient masks for scroll overflow */}
        {canScrollLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white via-white/80 to-transparent z-20 pointer-events-none" />
        )}
        {canScrollRight && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white via-white/80 to-transparent z-20 pointer-events-none" />
        )}

        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          className={`flex items-stretch gap-3 md:gap-4 overflow-x-auto py-2 px-1 scrollbar-none select-none ${
            isMouseDown ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x pan-y',
            scrollBehavior: isMouseDown ? 'auto' : 'smooth',
          }}
        >
          {siblingItems.map((item) => {
            const ind = item.individual;
            const isMale = ind.sex === 'M';
            const isFemale = ind.sex === 'F';

            // Distinctive badges for birth position
            let rankBadgeText = `Rang ${item.orderIndex}/${totalCount}`;
            if (item.isFirst) rankBadgeText = isFemale ? 'Aînée' : 'Aîné';
            else if (item.isLast) rankBadgeText = isFemale ? 'Benjamine' : 'Benjamin';
            else rankBadgeText = isFemale ? `Cadette (${item.orderIndex}e)` : `Cadet (${item.orderIndex}e)`;

            if (item.isCurrent) {
              return (
                <div
                  key={ind.id}
                  ref={activeCardRef}
                  className="w-64 sm:w-72 shrink-0 rounded-2xl bg-gradient-to-b from-amber-50/90 via-amber-50/50 to-white border-2 border-amber-600/90 p-4 shadow-md relative flex flex-col justify-between transition-transform duration-200 ring-4 ring-amber-400/20"
                >
                  {/* Top indicator: Selected Person */}
                  <div className="flex items-center justify-between gap-1.5 mb-2.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-900 text-white font-mono shadow-2xs">
                      <Sparkles className="w-3 h-3 text-amber-300" />
                      <span>Fiche consultée</span>
                    </span>

                    <span className="text-[11px] font-mono font-semibold text-amber-950 bg-amber-100/90 border border-amber-300/80 px-2 py-0.5 rounded-md">
                      {rankBadgeText}
                    </span>
                  </div>

                  {/* Body with avatar and identity */}
                  <div className="flex items-start gap-3">
                    <div 
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-serif text-lg font-bold shrink-0 shadow-xs border ${
                        isMale 
                          ? 'bg-blue-600 text-white border-blue-700' 
                          : isFemale 
                            ? 'bg-rose-500 text-white border-rose-600' 
                            : 'bg-stone-700 text-white border-stone-800'
                      }`}
                    >
                      {ind.givenName?.[0] || ind.name[0]}
                    </div>

                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`w-2 h-2 rounded-full ${isMale ? 'bg-blue-600' : 'bg-rose-500'}`} />
                        <h4 className="font-serif text-sm font-bold text-stone-950 truncate">
                          {ind.name}
                        </h4>
                      </div>

                      {item.sosa && (
                        <span className="inline-block text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-900 text-white">
                          {`Sosa ${item.sosa}`}
                        </span>
                      )}

                      <div className="text-[11px] text-stone-600 font-mono pt-1 space-y-0.5">
                        <p className="truncate">
                          ° {item.birthDateStr || (item.birthYear ? String(item.birthYear) : 'Date ?')}
                        </p>
                        {item.deathDateStr && (
                          <p className="truncate text-stone-500">
                            † {item.deathDateStr}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bottom anchor pill */}
                  <div className="mt-3 pt-2.5 border-t border-amber-200/80 flex items-center justify-between text-[11px]">
                    <span className="text-amber-900 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                      Au centre du plan
                    </span>
                    <span className="text-stone-400 font-mono text-[10px]">
                      Position {item.orderIndex}/{totalCount}
                    </span>
                  </div>
                </div>
              );
            }

            // Sibling Card (Older or Younger)
            let relativeLabel = '';
            if (item.relativeOrder === 'older') {
              relativeLabel = item.ageDiffYears !== undefined && Math.abs(item.ageDiffYears) > 0
                ? `${Math.abs(item.ageDiffYears)} ans plus âgé(e)`
                : 'Aîné(e)';
            } else if (item.relativeOrder === 'younger') {
              relativeLabel = item.ageDiffYears !== undefined && Math.abs(item.ageDiffYears) > 0
                ? `${Math.abs(item.ageDiffYears)} ans plus jeune`
                : 'Cadet(te)';
            } else if (item.relativeOrder === 'same_date') {
              relativeLabel = 'Même année';
            }

            return (
              <div
                key={ind.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!hasDragged) {
                    onSelectPerson(ind.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPerson(ind.id);
                  }
                }}
                className={`w-60 sm:w-64 shrink-0 rounded-2xl bg-white border border-stone-200/90 hover:border-amber-700 hover:bg-amber-50/30 p-4 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer text-left relative ${
                  item.relativeOrder === 'older' ? 'border-l-4 border-l-blue-400' : 'border-r-4 border-r-rose-400'
                }`}
              >
                {/* Top header of sibling card */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200/80">
                    {rankBadgeText}
                  </span>

                  {relativeLabel && (
                    <span className="text-[10px] font-medium text-stone-500 font-mono">
                      {relativeLabel}
                    </span>
                  )}
                </div>

                {/* Sibling Identity */}
                <div className="flex items-start gap-2.5">
                  <div 
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-serif text-sm font-bold shrink-0 border transition-transform group-hover:scale-105 ${
                      isMale 
                        ? 'bg-blue-50 text-blue-900 border-blue-200' 
                        : isFemale 
                          ? 'bg-rose-50 text-rose-900 border-rose-200' 
                          : 'bg-stone-50 text-stone-800 border-stone-200'
                    }`}
                  >
                    {ind.givenName?.[0] || ind.name[0]}
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isMale ? 'bg-blue-500' : 'bg-rose-400'}`} />
                      <h4 className="font-serif text-xs font-bold text-stone-900 group-hover:text-amber-950 truncate">
                        {ind.name}
                      </h4>
                    </div>

                    {item.sosa && (
                      <span className="inline-block text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-900 text-white">
                        {`Sosa ${item.sosa}`}
                      </span>
                    )}

                    <div className="text-[11px] text-stone-500 font-mono pt-0.5 space-y-0.5">
                      <p className="truncate">
                        ° {item.birthDateStr || (item.birthYear ? String(item.birthYear) : 'Date non renseignée')}
                      </p>
                      {item.deathDateStr && (
                        <p className="truncate text-stone-400">
                          † {item.deathDateStr}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom action */}
                <div className="mt-3 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-amber-900 font-semibold group-hover:underline">
                  <span>Afficher la fiche</span>
                  <span className="text-stone-400 group-hover:translate-x-0.5 transition-transform">→</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
