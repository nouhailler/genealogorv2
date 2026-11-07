import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ArchiveDocument, Individual } from '../types/genealogy';
import { portraitThumbnail, resolvePortrait } from '../lib/portrait';

/** Archives disponibles pour découper les portraits (fournies une fois par l'application) */
const PortraitArchivesContext = createContext<Map<string, ArchiveDocument>>(new Map());

export const PortraitProvider: React.FC<{ archives: ArchiveDocument[]; children: React.ReactNode }> = ({ archives, children }) => {
  const byId = useMemo(() => new Map(archives.map(a => [a.id, a])), [archives]);
  return <PortraitArchivesContext.Provider value={byId}>{children}</PortraitArchivesContext.Provider>;
};

interface PersonPortraitProps {
  person: Pick<Individual, 'portrait' | 'name' | 'givenName'>;
  /** Classes du conteneur (taille, forme, couleurs du repli) */
  className: string;
  /** Contenu affiché sans portrait (par défaut : l'initiale) */
  fallback?: React.ReactNode;
  /** Taille de la vignette générée, en pixels */
  resolution?: number;
}

/** Portrait de la personne (visage cadré sur une photo), ou son initiale à défaut */
export const PersonPortrait: React.FC<PersonPortraitProps> = ({ person, className, fallback, resolution = 160 }) => {
  const archivesById = useContext(PortraitArchivesContext);
  const resolved = resolvePortrait(person, archivesById);
  const [thumb, setThumb] = useState<string | null>(null);
  const key = resolved ? `${resolved.ref.archiveId}:${resolved.ref.tagId}:${resolved.box.x},${resolved.box.y},${resolved.box.width},${resolved.box.height}:${resolved.src.length}` : '';

  useEffect(() => {
    let cancelled = false;
    if (!resolved) {
      setThumb(null);
      return;
    }
    portraitThumbnail(resolved.src, resolved.box, resolution)
      .then(url => { if (!cancelled) setThumb(url); })
      .catch(() => { if (!cancelled) setThumb(null); });
    return () => { cancelled = true; };
  }, [key, resolution]);

  if (resolved && thumb) {
    return (
      <span className={`${className} overflow-hidden`}>
        <img src={thumb} alt={`Portrait de ${person.name}`} className="w-full h-full object-cover" draggable={false} />
      </span>
    );
  }
  return <span className={className}>{fallback ?? (person.givenName?.[0] || person.name[0])}</span>;
};
