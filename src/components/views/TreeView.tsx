import React, { useState, useRef, useEffect } from 'react';
import { 
  Users, User, ChevronRight, ChevronDown, Award, 
  MapPin, Calendar, FileText, Search, ZoomIn, ZoomOut, RotateCcw,
  Sparkles, ShieldCheck, UserPlus, Upload, GitFork, FolderTree
} from 'lucide-react';
import { GenealogyData, Individual } from '../../types/genealogy';
import { computeSosaNumbers } from '../../lib/sosa-aboville';
import { InfoTooltip } from '../InfoTooltip';
import { TreeSiblingCarousel } from './TreeSiblingCarousel';
import { FamilyLinksPanel } from './FamilyLinksPanel';

interface TreeViewProps {
  data: GenealogyData;
  selectedPersonId: string;
  onSelectPerson: (id: string) => void;
  onViewProfile: (id: string) => void;
  onViewArchives?: (personId: string) => void;
  archiveCountByPerson?: Record<string, number>;
  onAddNewPerson?: () => void;
  onOpenImportModal?: () => void;
  /** Définit la personne de référence (de cujus, Sosa 1) de l'arbre — administrateur uniquement */
  onSetRootPerson?: (personId: string) => void;
  onOpenTreeManager?: () => void;
  treeTitle?: string;
  onDeleteCurrentTree?: () => void;
  userRole?: import('../../types/genealogy').BranchRole;
}

export const TreeView: React.FC<TreeViewProps> = ({
  data,
  selectedPersonId,
  onSelectPerson,
  onViewProfile,
  onViewArchives,
  archiveCountByPerson = {},
  onAddNewPerson,
  onOpenImportModal,
  onSetRootPerson,
  onOpenTreeManager,
  treeTitle,
  onDeleteCurrentTree,
  userRole,
}) => {
  const [treeMode, setTreeMode] = useState<'ancestors' | 'descendants'>('ancestors');
  // Petit écran : 3 générations et fratrie dans le panneau « Liens familiaux » plutôt qu'à droite de l'arbre
  const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 640;
  const [generationsCount, setGenerationsCount] = useState<number>(isSmallScreen ? 3 : 4);
  const [searchFilter, setSearchFilter] = useState('');
  const [showSiblingsRight, setShowSiblingsRight] = useState<boolean>(!isSmallScreen);
  const treeCanvasRef = useRef<HTMLDivElement>(null);
  const treeContentRef = useRef<HTMLDivElement>(null);

  // Ajustement à l'écran : l'arbre est réduit pour tenir en largeur (zoom = null), ou zoomé manuellement
  const [zoom, setZoom] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [availableWidth, setAvailableWidth] = useState(0);

  useEffect(() => {
    const canvas = treeCanvasRef.current;
    const content = treeContentRef.current;
    if (!canvas || !content || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const style = getComputedStyle(canvas);
      setAvailableWidth(canvas.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      // offsetWidth/Height ignorent la transformation : taille réelle de l'arbre à l'échelle 1
      setNaturalSize({ width: content.offsetWidth, height: content.offsetHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    observer.observe(content);
    return () => observer.disconnect();
  }, [treeMode, selectedPersonId, data]);

  const fitScale = naturalSize.width > 0 && availableWidth > 0
    ? Math.min(1, Math.max(0.25, availableWidth / naturalSize.width))
    : 1;
  const scale = zoom ?? fitScale;
  const changeZoom = (delta: number) => setZoom(Math.min(1.5, Math.max(0.25, Math.round((scale + delta) * 100) / 100)));

  // Arbre plus large que l'écran : recentrer le défilement horizontal sur la personne pivot (en haut au centre)
  useEffect(() => {
    const el = treeCanvasRef.current;
    if (!el) return;
    const rootCard = el.querySelector<HTMLElement>('[data-tree-root]');
    if (rootCard) {
      const offset = rootCard.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      el.scrollLeft = Math.max(0, offset + rootCard.offsetWidth / 2 - el.clientWidth / 2);
    } else {
      el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    }
  }, [selectedPersonId, generationsCount, treeMode, showSiblingsRight, scale]);

  const currentPerson = data.individuals[selectedPersonId] || Object.values(data.individuals)[0];
  // Numérotation Sosa-Stradonitz toujours relative au de cujus de l'arbre (comme la fiche individuelle),
  // indépendamment de la personne pivot affichée.
  const rootId = data.rootPersonId && data.individuals[data.rootPersonId] ? data.rootPersonId : currentPerson?.id;
  const sosaMap = rootId ? computeSosaNumbers(data, rootId) : {};
  const isCurrentRoot = !!currentPerson && currentPerson.id === rootId;
  const rootPerson = rootId ? data.individuals[rootId] : undefined;

  // Helper to get all siblings for a person (sorted chronologically)
  const getSiblings = (personId: string): Individual[] => {
    const person = data.individuals[personId];
    if (!person) return [];
    const siblingIds = new Set<string>();
    for (const famId of person.familiesAsChild) {
      const fam = data.families[famId];
      if (fam && fam.childrenIds) {
        for (const cId of fam.childrenIds) {
          if (cId !== person.id && data.individuals[cId]) {
            siblingIds.add(cId);
          }
        }
      }
    }
    const siblings = Array.from(siblingIds).map(id => data.individuals[id]);
    return siblings.sort((a, b) => {
      const getSortKey = (ind: Individual) => {
        if (ind.birth?.parsedDate?.year) {
          return ind.birth.parsedDate.year * 10000 + (ind.birth.parsedDate.month || 1) * 100 + (ind.birth.parsedDate.day || 1);
        }
        if (ind.birth?.date) {
          const m = ind.birth.date.match(/\b(\d{4})\b/);
          if (m) return parseInt(m[1], 10) * 10000;
        }
        return 99990000;
      };
      return getSortKey(a) - getSortKey(b);
    });
  };

  const rootSiblings = currentPerson ? getSiblings(currentPerson.id) : [];

  // Search individuals
  const filteredIndividuals = searchFilter.trim()
    ? Object.values(data.individuals).filter(ind =>
        ind.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (ind.birth?.place && ind.birth.place.toLowerCase().includes(searchFilter.toLowerCase()))
      )
    : [];

  // Helper to get parents
  const getParents = (personId: string): { father?: Individual; mother?: Individual } => {
    const person = data.individuals[personId];
    if (!person) return {};
    for (const famId of person.familiesAsChild) {
      const fam = data.families[famId];
      if (fam) {
        return {
          father: fam.husbandId ? data.individuals[fam.husbandId] : undefined,
          mother: fam.wifeId ? data.individuals[fam.wifeId] : undefined,
        };
      }
    }
    return {};
  };

  // Helper to get children
  const getChildren = (personId: string): Individual[] => {
    const person = data.individuals[personId];
    if (!person) return [];
    const children: Individual[] = [];
    for (const famId of person.familiesAsSpouse) {
      const fam = data.families[famId];
      if (fam) {
        for (const childId of fam.childrenIds) {
          if (data.individuals[childId]) {
            children.push(data.individuals[childId]);
          }
        }
      }
    }
    return children;
  };

  // Conjoints de la personne (toutes unions)
  const getSpouses = (personId: string): Individual[] => {
    const person = data.individuals[personId];
    if (!person) return [];
    const spouses: Individual[] = [];
    for (const famId of person.familiesAsSpouse) {
      const fam = data.families[famId];
      const spouseId = fam && (fam.husbandId === personId ? fam.wifeId : fam.husbandId);
      if (spouseId && data.individuals[spouseId] && !spouses.some(s => s.id === spouseId)) {
        spouses.push(data.individuals[spouseId]);
      }
    }
    return spouses;
  };

  // Recursive Ancestor Node
  const renderAncestorNode = (person: Individual | undefined, gen: number, sosa: number) => {
    if (gen > generationsCount) return null;

    if (!person) {
      return (
        <div className="flex flex-col items-center">
          <div className="w-36 sm:w-52 p-2 sm:p-3 rounded-xl border border-dashed border-stone-300 bg-stone-50/50 text-center text-xs text-stone-400 italic">
            Ancêtre non renseigné
          </div>
        </div>
      );
    }

    const { father, mother } = getParents(person.id);
    const isSelected = person.id === selectedPersonId;
    const hasArchives = archiveCountByPerson[person.id] > 0;

    const isRootGen = gen === 1;
    const siblings = isRootGen ? rootSiblings : [];

    const personCard = (
      <div
        onClick={() => onSelectPerson(person.id)}
        data-tree-root={isRootGen ? '' : undefined}
        className={`w-40 sm:w-56 p-2.5 sm:p-3.5 rounded-xl border transition-all cursor-pointer relative shadow-xs text-left group ${
          isSelected
            ? 'bg-amber-50 border-amber-800 ring-2 ring-amber-800/40 shadow-sm'
            : 'bg-white border-stone-200/90 hover:border-stone-400 hover:bg-stone-50/70'
        }`}
      >
        {/* Top meta tags */}
        <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-stone-500 mb-1">
          <span className="flex items-center gap-1 font-semibold text-stone-700">
            <span className={`w-2 h-2 rounded-full ${person.sex === 'M' ? 'bg-blue-600' : 'bg-rose-500'}`} />
            {sosaMap[person.id] ? `Sosa ${sosaMap[person.id]}` : `Gén. ${gen}`}
          </span>
          {hasArchives && (
            <span className="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded font-medium flex items-center gap-0.5">
              <FileText className="w-2.5 h-2.5" />
              <span>{archiveCountByPerson[person.id]} acte(s)</span>
            </span>
          )}
        </div>

        {/* Name */}
        <h4 className="font-serif text-sm font-bold text-stone-900 group-hover:text-amber-900 transition-colors line-clamp-1">
          {person.name}
        </h4>

        {/* Dates & places */}
        <div className="mt-1.5 space-y-0.5 text-[11px] text-stone-600">
          {person.birth?.date && (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-stone-400 font-mono">°</span>
              <span className="font-mono">{person.birth.date}</span>
              {person.birth.place && <span className="text-stone-400 truncate">· {person.birth.place.split(',')[0]}</span>}
            </div>
          )}
          {person.death?.date && (
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-stone-400 font-mono">+</span>
              <span className="font-mono">{person.death.date}</span>
              {person.death.place && <span className="text-stone-400 truncate">· {person.death.place.split(',')[0]}</span>}
            </div>
          )}
        </div>

        {/* View Profile Action */}
        <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-500">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewProfile(person.id);
            }}
            className="font-medium text-amber-800 hover:underline"
          >
            Fiche biographique →
          </button>
        </div>
      </div>
    );

    const mainTreeColumn = (
      <div className="flex flex-col items-center">
        {personCard}

        {/* Tree branch connections */}
        {gen < generationsCount && (father || mother) && (
          <div className="flex flex-col items-center w-full">
            <div className="w-px h-6 bg-stone-300" />
            <div className="relative flex justify-center gap-2 sm:gap-6 pt-4 sm:pt-6 border-t border-stone-300 w-full">
              {renderAncestorNode(father, gen + 1, sosa * 2)}
              {renderAncestorNode(mother, gen + 1, sosa * 2 + 1)}
            </div>
          </div>
        )}
      </div>
    );

    if (isRootGen && siblings.length > 0 && showSiblingsRight) {
      return (
        <div className="flex items-start">
          {mainTreeColumn}

          {/* Sibling strip displayed to the right in the tree */}
          <div className="flex items-center gap-2 pl-3 pt-3 self-start">
            <div className="flex items-center shrink-0">
              <div className="w-6 h-0.5 bg-amber-600/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-600 shrink-0" />
            </div>

            <TreeSiblingCarousel
              currentPerson={person}
              siblings={siblings}
              sosaMap={sosaMap}
              onSelectPerson={onSelectPerson}
              onViewProfile={onViewProfile}
            />
          </div>
        </div>
      );
    }

    return mainTreeColumn;
  };

  // Écran d'accueil pour arbre vierge
  if (!currentPerson || Object.keys(data.individuals).length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-12">
        <div className="bg-white dark:bg-[#1A1D24] border border-stone-200/90 dark:border-stone-800 rounded-2xl p-8 sm:p-12 text-center shadow-xs space-y-6">
          <div className="w-16 h-16 mx-auto bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-200/80 dark:border-amber-900/40 rounded-2xl flex items-center justify-center shadow-xs">
            <GitFork className="w-8 h-8 text-amber-800 dark:text-amber-400" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="font-serif text-2xl font-bold text-stone-900 dark:text-stone-100">
              {treeTitle ? `L'arbre « ${treeTitle} » est prêt` : 'Votre arbre généalogique est prêt'}
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
              Cet arbre ne contient encore aucun individu. Importez-y votre fichier GEDCOM (.ged) ou commencez à saisir vos ancêtres.
              {onOpenTreeManager && ' Pour travailler sur une autre famille, créez d\'abord un nouvel arbre.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-900 hover:bg-amber-950 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Importer un fichier GEDCOM (.ged)</span>
              </button>
            )}

            {onAddNewPerson && (
              <button
                type="button"
                onClick={onAddNewPerson}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold rounded-xl border border-stone-300 dark:border-stone-700 transition-all cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-amber-800 dark:text-amber-400" />
                <span>Créer la première personne</span>
              </button>
            )}
          </div>

          {onOpenTreeManager && (
            <button
              type="button"
              onClick={onOpenTreeManager}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-400 hover:underline cursor-pointer"
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Créer un nouvel arbre ou changer d'arbre</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
      
      {/* Control bar */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Selected focal individual */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-900 font-serif font-bold text-lg flex items-center justify-center shrink-0">
            {currentPerson.givenName?.[0] || currentPerson.name[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-lg font-bold text-stone-900 dark:text-stone-100">
                {currentPerson.name}
              </h2>
              {sosaMap[currentPerson.id] && (
                <div className="flex items-center gap-1">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
                    Sosa {sosaMap[currentPerson.id]}
                  </span>
                  <InfoTooltip content="Numérotation Sosa-Stradonitz : 1 est le de cujus (racine de référence de l'arbre), les pères ont des numéros pairs et les mères des numéros impairs." />
                </div>
              )}
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              {isCurrentRoot ? 'Racine de l\'arbre (de cujus)' : 'Personne pivot de l\'affichage'} · {currentPerson.birth?.date || 'Date inconnue'} {currentPerson.birth?.place ? `à ${currentPerson.birth.place.split(',')[0]}` : ''}
            </p>
            {!isCurrentRoot && (
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                {rootPerson && <span>Sosa calculés depuis {rootPerson.name}</span>}
                {onSetRootPerson && (
                  <button
                    type="button"
                    onClick={() => onSetRootPerson(currentPerson.id)}
                    className="font-semibold text-amber-800 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    Définir comme racine (Sosa 1)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick search & Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {onAddNewPerson && (
            <button
              onClick={onAddNewPerson}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 rounded-lg transition-colors cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Ajouter une personne</span>
            </button>
          )}

          <div className="relative w-56 flex items-center">
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Changer d'individu..."
              className="w-full text-xs bg-stone-50 dark:bg-stone-800/80 border border-stone-200 dark:border-stone-700 rounded-lg pl-8 pr-7 py-1.5 text-stone-800 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800"
            />
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2" />
            <div className="absolute right-2 top-1.5">
              <InfoTooltip content="Recherche instantanée pour changer la personne pivot et recalculer l'arbre et les Sosa." />
            </div>

            {/* Autocomplete dropdown */}
            {filteredIndividuals.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-lg max-h-48 overflow-y-auto z-30 p-1">
                {filteredIndividuals.slice(0, 8).map(ind => (
                  <button
                    key={ind.id}
                    onClick={() => {
                      onSelectPerson(ind.id);
                      setSearchFilter('');
                    }}
                    className="w-full text-left p-1.5 hover:bg-amber-50 dark:hover:bg-stone-800 rounded text-xs text-stone-800 dark:text-stone-200 flex items-center justify-between"
                  >
                    <span className="font-medium truncate">{ind.name}</span>
                    <span className="text-[10px] text-stone-400 font-mono">{ind.birth?.date || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mode ascendance vs descendance */}
          <div className="flex items-center gap-1">
            <div className="flex items-center p-1 bg-stone-100 dark:bg-stone-800/90 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-300">
              <button
                onClick={() => setTreeMode('ancestors')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  treeMode === 'ancestors' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs font-semibold' : 'hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                Ascendance
              </button>
              <button
                onClick={() => setTreeMode('descendants')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  treeMode === 'descendants' ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-2xs font-semibold' : 'hover:text-stone-900 dark:hover:text-stone-100'
                }`}
              >
                Descendance
              </button>
            </div>
            <InfoTooltip content="Ascendance : remonte vers les ancêtres. Descendance : déroule la postérité et les enfants." />
          </div>

          {/* Nombre de générations */}
          <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400 font-mono">
            <span>Générations:</span>
            {[3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setGenerationsCount(n)}
                className={`w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer ${
                  generationsCount === n ? 'bg-amber-900 dark:bg-amber-700 text-white font-bold' : 'bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300'
                }`}
              >
                {n}
              </button>
            ))}
            <InfoTooltip content="Ajuste la profondeur d'arbre affichée (3 à 5 générations)." />
          </div>

          {/* Bouton Fratrie à droite */}
          {rootSiblings.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowSiblingsRight(!showSiblingsRight)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                  showSiblingsRight
                    ? 'bg-amber-100/90 text-amber-950 border-amber-300 shadow-2xs'
                    : 'bg-stone-100 hover:bg-stone-200 text-stone-600 border-stone-200'
                }`}
                title="Afficher ou masquer les frères et sœurs à droite dans l'arbre"
              >
                <Users className="w-3.5 h-3.5 text-amber-800" />
                <span>{`Fratrie (${rootSiblings.length})`}</span>
              </button>
              <InfoTooltip content="Affiche les frères et sœurs à droite de la personne dans l'arbre avec défilement fluide souris et tactile." />
            </div>
          )}
        </div>
      </div>

      {/* Liens familiaux lisibles sur tous les écrans : parents, fratrie, conjoints, enfants */}
      <FamilyLinksPanel
        father={getParents(currentPerson.id).father}
        mother={getParents(currentPerson.id).mother}
        siblings={rootSiblings}
        spouses={getSpouses(currentPerson.id)}
        children={getChildren(currentPerson.id)}
        sosaMap={sosaMap}
        onSelectPerson={onSelectPerson}
      />

      {/* Interactive Tree Rendering Canvas */}
      {/* Pas de justify-center sur le conteneur défilant : un arbre plus large que l'écran serait
          rogné à gauche sans pouvoir y défiler. On centre avec des marges auto, ramenées à 0 en cas de débordement. */}
      <div className="relative">
      {treeMode === 'ancestors' && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-white/95 dark:bg-stone-900/95 border border-stone-200 dark:border-stone-700 rounded-lg p-1 shadow-xs">
          <button type="button" onClick={() => changeZoom(-0.1)} title="Réduire" aria-label="Réduire l'arbre"
            className="p-1.5 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 cursor-pointer">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => setZoom(null)} title="Ajuster l'arbre à la largeur de l'écran"
            className={`px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${zoom === null ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200' : 'hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300'}`}>
            Ajuster · {Math.round(scale * 100)} %
          </button>
          <button type="button" onClick={() => changeZoom(0.1)} title="Agrandir" aria-label="Agrandir l'arbre"
            className="p-1.5 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 cursor-pointer">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      )}
      <div ref={treeCanvasRef} className="bg-[#F7F4EE]/60 border border-stone-200/90 rounded-2xl p-3 sm:p-8 min-h-[320px] sm:min-h-[500px] overflow-auto flex items-center shadow-inner">
        {treeMode === 'ancestors' ? (
          <div className="min-w-full flex pt-12 pb-4 sm:py-10">
            {/* Boîte à la taille réduite de l'arbre, centrée par marges auto ; l'arbre y est mis à l'échelle depuis le coin haut-gauche */}
            <div
              className="mx-auto shrink-0 relative"
              style={{ width: naturalSize.width * scale || undefined, height: naturalSize.height * scale || undefined }}
            >
              <div
                ref={treeContentRef}
                className="absolute top-0 left-0 w-max"
                style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
              >
                {renderAncestorNode(currentPerson, 1, 1)}
              </div>
            </div>
          </div>
        ) : (
          /* Descendance View */
          <div className="space-y-6 w-full max-w-4xl py-6">
            <div className="flex flex-col md:flex-row items-start gap-4">
              <div className="p-4 bg-white border border-stone-200 rounded-xl shadow-xs shrink-0 w-64">
                <span className="text-xs font-mono text-stone-500 uppercase tracking-widest block mb-1">Racine</span>
                <h3 className="font-serif text-lg font-bold text-stone-900">{currentPerson.name}</h3>
                <p className="text-xs text-stone-600 mt-1">{currentPerson.birth?.date} — {currentPerson.death?.date || 'Vivant'}</p>
              </div>

              {rootSiblings.length > 0 && showSiblingsRight && (
                <div className="flex-1 w-full overflow-hidden">
                  <TreeSiblingCarousel
                    currentPerson={currentPerson}
                    siblings={rootSiblings}
                    sosaMap={sosaMap}
                    onSelectPerson={onSelectPerson}
                    onViewProfile={onViewProfile}
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 pl-6 border-l-2 border-amber-700/40">
              <span className="text-xs font-semibold text-stone-700 uppercase tracking-wider block">
                Enfants directs ({getChildren(currentPerson.id).length})
              </span>

              {getChildren(currentPerson.id).length === 0 ? (
                <p className="text-xs text-stone-500 italic">Aucun enfant répertorié pour cette personne.</p>
              ) : (
                getChildren(currentPerson.id).map(child => (
                  <div
                    key={child.id}
                    onClick={() => onSelectPerson(child.id)}
                    className="p-3 bg-white border border-stone-200 hover:border-amber-700 rounded-xl cursor-pointer transition-all flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${child.sex === 'M' ? 'bg-blue-600' : 'bg-rose-500'}`} />
                        <h4 className="font-serif text-sm font-bold text-stone-900">{child.name}</h4>
                      </div>
                      <span className="text-xs text-stone-500 block mt-0.5">
                        {child.birth?.date || 'Date inconnue'} {child.birth?.place ? `à ${child.birth.place.split(',')[0]}` : ''}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewProfile(child.id);
                      }}
                      className="text-xs text-amber-800 hover:underline font-medium"
                    >
                      Fiche →
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      </div>

    </div>
  );
};
