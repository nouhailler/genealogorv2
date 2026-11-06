import React, { useState } from 'react';
import { Calendar, MapPin, Eye, EyeOff } from 'lucide-react';
import { Logo } from './Logo';
import { PhotoShareSnapshot, LIVING_PLACEHOLDER } from '../lib/photo-share';

interface SharedPhotoViewProps {
  snapshot: PhotoShareSnapshot;
}

/** Page publique d'un lien photo : l'image, ses repères numérotés et la légende des personnes */
export const SharedPhotoView: React.FC<SharedPhotoViewProps> = ({ snapshot }) => {
  const [activeN, setActiveN] = useState<number | null>(null);
  const [showPins, setShowPins] = useState(true);
  const { title, date, place, image, tags, generatedAt } = snapshot;

  return (
    <div className="min-h-screen bg-[#FBF9F5] dark:bg-[#121418] text-stone-900 dark:text-stone-100">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-[#1A1D24]/80">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Logo size="sm" showText={true} />
          <span className="text-[11px] text-stone-500 dark:text-stone-400">Photo partagée · lecture seule</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-bold">{title}</h1>
          {(date || place) && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600 dark:text-stone-400">
              {date && <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{date}</span>}
              {place && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{place}</span>}
            </p>
          )}
        </div>

        <div className="bg-stone-900 rounded-2xl p-2 sm:p-3 flex justify-center">
          <div className="relative inline-block max-w-full">
            <img
              src={image}
              alt={title}
              className="block max-w-full max-h-[75vh] w-auto h-auto rounded-lg select-none"
              draggable={false}
            />
            {showPins && tags.map(tag => {
              const active = activeN === tag.n;
              return (
                <button
                  key={tag.n}
                  type="button"
                  style={{ left: `${tag.x}%`, top: `${tag.y}%` }}
                  onMouseEnter={() => setActiveN(tag.n)}
                  onMouseLeave={() => setActiveN(null)}
                  onFocus={() => setActiveN(tag.n)}
                  onBlur={() => setActiveN(null)}
                  onClick={() => {
                    setActiveN(tag.n);
                    document.getElementById(`photo-tag-${tag.n}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }}
                  aria-label={`${tag.n}. ${tag.name}`}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full shadow-lg transition-transform ${
                    active
                      ? 'scale-125 z-20 bg-amber-900 text-white ring-2 ring-amber-400'
                      : 'z-10 bg-stone-900/80 text-amber-200 border-2 border-amber-300/80'
                  }`}
                >
                  <span className="text-[10px] sm:text-[11px] font-bold font-mono">{tag.n}</span>
                  {active && (
                    <span className={`absolute bottom-full mb-2 ${
                      tag.x < 25 ? 'left-0' : tag.x > 75 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    } max-w-[60vw] truncate whitespace-nowrap px-2 py-1 rounded-md bg-white text-stone-900 text-xs font-semibold shadow-lg pointer-events-none`}>
                      {tag.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <section className="bg-white dark:bg-[#1A1D24] border border-stone-200 dark:border-stone-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-serif text-lg font-bold">
              Personnes identifiées ({tags.length})
            </h2>
            {tags.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPins(v => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white"
              >
                {showPins ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showPins ? 'Masquer les repères' : 'Afficher les repères'}
              </button>
            )}
          </div>
          {tags.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">Aucune personne n'a encore été identifiée sur cette photo.</p>
          ) : (
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {tags.map(tag => {
                const active = activeN === tag.n;
                const isPlaceholder = tag.name === LIVING_PLACEHOLDER;
                return (
                  <li
                    key={tag.n}
                    id={`photo-tag-${tag.n}`}
                    onMouseEnter={() => setActiveN(tag.n)}
                    onMouseLeave={() => setActiveN(null)}
                    onClick={() => setActiveN(active ? null : tag.n)}
                    className={`flex items-start gap-2.5 p-2 rounded-lg cursor-default transition-colors ${
                      active ? 'bg-amber-100 dark:bg-amber-950/50' : 'hover:bg-stone-50 dark:hover:bg-stone-800/50'
                    }`}
                  >
                    <span className="w-6 h-6 shrink-0 rounded-full bg-stone-900 text-amber-200 text-[11px] font-bold font-mono flex items-center justify-center">
                      {tag.n}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold ${isPlaceholder ? 'italic text-stone-500 dark:text-stone-400' : ''}`}>
                        {tag.name}
                        {tag.years && <span className="ml-1.5 font-normal text-xs text-stone-500 dark:text-stone-400">({tag.years})</span>}
                      </span>
                      {tag.label && <span className="block text-xs text-stone-600 dark:text-stone-400">{tag.label}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <p className="text-center text-[11px] text-stone-500 dark:text-stone-400">
          Partagé avec Genealogor · version du {new Date(generatedAt).toLocaleString('fr-FR')}
        </p>
      </main>
    </div>
  );
};
