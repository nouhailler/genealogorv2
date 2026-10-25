import { 
  User, Calendar, MapPin, Briefcase, FileText, Heart, 
  Users, Edit3, ArrowLeft, BookOpen, Shield, Award,
  Camera, Tag, ExternalLink, Building2, Globe, Clock, ArrowUp, ArrowDown
} from 'lucide-react';
import { GenealogyData, Individual, ArchiveDocument } from '../../types/genealogy';
import { computeSosaNumbers } from '../../lib/sosa-aboville';
import { extractDept, deptName, region } from '../../lib/place-gazetteer';
import { linksFor, deptArchives } from '../../lib/archives-templates';
import { SiblingStrip } from './SiblingStrip';

interface ProfileViewProps {
  personId: string;
  data: GenealogyData;
  archives: ArchiveDocument[];
  onSelectPerson: (id: string) => void;
  onEditPerson?: (person: Individual) => void;
  onOpenArchives: () => void;
  /** Ouvre la chronologie depuis cette fiche, vers les ascendants ou les descendants */
  onOpenTimeline?: (scope: 'ascendants' | 'descendants') => void;
  onSelectArchive: (archiveId: string) => void;
  onAddNewPerson?: () => void;
  onOpenImportModal?: () => void;
  onOpenDeptDirectory?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  personId,
  data,
  archives,
  onSelectPerson,
  onEditPerson,
  onOpenArchives,
  onOpenTimeline,
  onSelectArchive,
  onAddNewPerson,
  onOpenImportModal,
  onOpenDeptDirectory,
}) => {
  const person = data.individuals[personId] || Object.values(data.individuals)[0];

  if (!person) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 sm:p-12 shadow-xs space-y-5">
          <div className="w-14 h-14 mx-auto bg-amber-50 text-amber-900 border border-amber-200/80 rounded-2xl flex items-center justify-center">
            <User className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-serif text-xl font-bold text-stone-900">Aucune fiche individuelle</h3>
            <p className="text-xs sm:text-sm text-stone-600">
              L'arbre généalogique est actuellement vierge. Ajoutez une personne ou importez un fichier GEDCOM pour consulter et enrichir vos fiches individuelles.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {onAddNewPerson && (
              <button
                onClick={onAddNewPerson}
                className="px-4 py-2 bg-amber-900 hover:bg-amber-950 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
              >
                + Créer la première personne
              </button>
            )}
            {onOpenImportModal && (
              <button
                onClick={onOpenImportModal}
                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-xl border border-stone-300 transition-colors"
              >
                Importer un GEDCOM
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const sosaMap = computeSosaNumbers(data);
  const sosa = sosaMap[person.id];

  // Linked archives
  const personArchives = archives.filter(doc => doc.linkedPersonIds?.includes(person.id));

  // Photos where this person is tagged
  const taggedPhotos = archives.filter(doc => 
    doc.photoTags?.some(tag => tag.personId === person.id)
  );

  // Parents
  let father: Individual | undefined;
  let mother: Individual | undefined;
  for (const famId of person.familiesAsChild) {
    const fam = data.families[famId];
    if (fam) {
      if (fam.husbandId) father = data.individuals[fam.husbandId];
      if (fam.wifeId) mother = data.individuals[fam.wifeId];
    }
  }

  // Spouses and Children
  const marriages: Array<{ spouse?: Individual; marriageDate?: string; marriagePlace?: string; children: Individual[] }> = [];
  for (const famId of person.familiesAsSpouse) {
    const fam = data.families[famId];
    if (fam) {
      const spouseId = fam.husbandId === person.id ? fam.wifeId : fam.husbandId;
      const spouse = spouseId ? data.individuals[spouseId] : undefined;
      const children = fam.childrenIds.map(id => data.individuals[id]).filter(Boolean);
      marriages.push({
        spouse,
        marriageDate: fam.marriage?.date,
        marriagePlace: fam.marriage?.place,
        children,
      });
    }
  }

  // Siblings
  const siblings: Individual[] = [];
  for (const famId of person.familiesAsChild) {
    const fam = data.families[famId];
    if (fam) {
      for (const cId of fam.childrenIds) {
        if (cId !== person.id && data.individuals[cId]) {
          siblings.push(data.individuals[cId]);
        }
      }
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 space-y-8">
      
      {/* Header Banner */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-50/50 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-100/80 border border-amber-200/60 text-amber-950 font-serif text-2xl font-bold flex items-center justify-center shrink-0 shadow-2xs">
            {person.givenName?.[0] || person.name[0]}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`w-2.5 h-2.5 rounded-full ${person.sex === 'M' ? 'bg-blue-600' : 'bg-rose-500'}`} />
              <h1 className="font-serif text-2xl md:text-3xl font-bold text-stone-900">
                {person.name}
              </h1>
              {sosa && (
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-md bg-amber-900 text-white shadow-2xs">
                  Sosa {sosa}
                </span>
              )}
            </div>

            {person.occupations && person.occupations.length > 0 && (
              <p className="text-xs font-medium text-amber-900 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                <span>{person.occupations.join(', ')}</span>
              </p>
            )}

            <div className="text-xs text-stone-500 flex items-center gap-2 pt-0.5">
              <span>{person.birth?.date ? `° ${person.birth.date}` : 'Naissance inconnue'}</span>
              <span>·</span>
              <span>{person.death?.date ? `+ ${person.death.date}` : 'Décès non répertorié'}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          {/* Chronologie depuis cette fiche */}
          {onOpenTimeline && (
            <div className="flex items-center rounded-lg border border-stone-200 bg-white overflow-hidden text-xs font-semibold text-stone-700">
              <span className="flex items-center gap-1.5 px-2.5 py-2 bg-stone-50 border-r border-stone-200 text-stone-500">
                <Clock className="w-3.5 h-3.5" />
                <span>Chronologie</span>
              </span>
              {([
                ['ascendants', 'Ascendants', ArrowUp],
                ['descendants', 'Descendants', ArrowDown],
              ] as const).map(([scope, label, Icon]) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => {
                    onSelectPerson(person.id);
                    onOpenTimeline(scope);
                  }}
                  title={`Chronologie de ${person.name} et de ses ${label.toLowerCase()}`}
                  className="flex items-center gap-1 px-2.5 py-2 hover:bg-amber-50 hover:text-amber-900 cursor-pointer"
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}

          {onEditPerson ? (
            <button
              onClick={() => onEditPerson(person)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Modifier la fiche</span>
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-500 bg-stone-100 rounded-lg border border-stone-200">
              <Shield className="w-3.5 h-3.5 text-stone-400" />
              <span>Profil Lecteur (Consultation)</span>
            </span>
          )}
        </div>
      </div>

      {/* Fratrie sur le même plan horizontal (Frères et Sœurs à gauche et à droite) */}
      <SiblingStrip
        person={person}
        data={data}
        sosaMap={sosaMap}
        onSelectPerson={onSelectPerson}
      />

      {/* Main Grid: Life Events & Family Relations */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Life Events & Associated Archives (7 cols) */}
        <div className="md:col-span-7 space-y-6">
          
          {/* Événements d'état civil */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider font-mono text-stone-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-800" />
              <span>Actes & Événements Biographiques</span>
            </h2>

            <div className="space-y-4">
              {/* Naissance */}
              {person.birth && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50/70 border border-stone-100">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-900 font-mono text-xs font-bold shrink-0">
                    BIRT
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-stone-900">Naissance</h3>
                    <p className="text-xs font-mono text-stone-700 mt-0.5">{person.birth.date || 'Date non précisée'}</p>
                    {person.birth.place && (
                      <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-stone-400" />
                        <span>{person.birth.place}</span>
                      </p>
                    )}
                    {person.birth.notes && person.birth.notes.length > 0 && (
                      <p className="text-[11px] text-stone-500 italic mt-1">{person.birth.notes.join(' ')}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Baptême */}
              {person.baptism && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50/70 border border-stone-100">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-900 font-mono text-xs font-bold shrink-0">
                    BAPM
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-stone-900">Baptême religieux</h3>
                    <p className="text-xs font-mono text-stone-700 mt-0.5">{person.baptism.date || 'Date non précisée'}</p>
                    {person.baptism.place && (
                      <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-stone-400" />
                        <span>{person.baptism.place}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Décès */}
              {person.death && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50/70 border border-stone-100">
                  <div className="p-2 rounded-lg bg-rose-100 text-rose-900 font-mono text-xs font-bold shrink-0">
                    DEAT
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-stone-900">Décès</h3>
                    <p className="text-xs font-mono text-stone-700 mt-0.5">{person.death.date || 'Date non précisée'}</p>
                    {person.death.place && (
                      <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-stone-400" />
                        <span>{person.death.place}</span>
                      </p>
                    )}
                    {person.death.notes && person.death.notes.length > 0 && (
                      <p className="text-[11px] text-stone-500 italic mt-1">{person.death.notes.join(' ')}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Sépulture */}
              {person.burial && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50/70 border border-stone-100">
                  <div className="p-2 rounded-lg bg-stone-200 text-stone-800 font-mono text-xs font-bold shrink-0">
                    BURI
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-stone-900">Sépulture</h3>
                    <p className="text-xs font-mono text-stone-700 mt-0.5">{person.burial.date || 'Date non précisée'}</p>
                    {person.burial.place && (
                      <p className="text-xs text-stone-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-stone-400" />
                        <span>{person.burial.place}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Photographies & Portraits où la personne est identifiée */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider font-mono text-stone-500 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-amber-800" />
                <span>Photographies & Clichés Identifiés ({taggedPhotos.length})</span>
              </h2>
              <button
                onClick={onOpenArchives}
                className="text-xs text-amber-800 hover:underline font-medium flex items-center gap-1"
              >
                <span>Atelier photo & archives</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            {taggedPhotos.length === 0 ? (
              <div className="p-5 text-center bg-stone-50 rounded-xl border border-dashed border-stone-200 text-xs text-stone-500">
                <p>Aucune photographie avec identification pour cet ancêtre.</p>
                <button
                  onClick={onOpenArchives}
                  className="mt-2 text-amber-800 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <Tag className="w-3 h-3" />
                  <span>Importer un cliché et tagger son visage</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {taggedPhotos.map(doc => {
                  const personTag = doc.photoTags?.find(t => t.personId === person.id);
                  return (
                    <div
                      key={doc.id}
                      onClick={() => {
                        onSelectArchive(doc.id);
                        onOpenArchives();
                      }}
                      className="group cursor-pointer bg-[#FBF9F5] border border-stone-200 hover:border-amber-700 hover:shadow-sm rounded-xl overflow-hidden transition-all text-left flex flex-col"
                    >
                      {/* Photo Thumbnail with highlight pin indicator */}
                      <div className="h-36 bg-stone-900 relative overflow-hidden flex items-center justify-center">
                        {doc.fileData ? (
                          <img
                            src={doc.fileData}
                            alt={doc.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="p-4 text-center text-stone-400 font-serif text-xs">
                            {doc.title}
                          </div>
                        )}

                        {/* Tag locator chip */}
                        {personTag && (
                          <div 
                            style={{ left: `${personTag.x}%`, top: `${personTag.y}%` }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-amber-600 border-2 border-white text-white font-bold text-[10px] flex items-center justify-center shadow-lg group-hover:scale-125 transition-transform"
                            title="Emplacement identifié"
                          >
                            ✓
                          </div>
                        )}

                        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-white/90 bg-stone-950/70 backdrop-blur-xs px-2 py-0.5 rounded">
                          <span className="font-mono">{doc.date || 'Cliché d\'époque'}</span>
                          <span>{doc.photoTags?.length || 1} personne(s) taggée(s)</span>
                        </div>
                      </div>

                      {/* Card Content */}
                      <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="font-serif text-xs font-bold text-stone-900 group-hover:text-amber-900 line-clamp-1">
                            {doc.title}
                          </h4>
                          {personTag?.label && (
                            <p className="text-[11px] text-amber-950 font-medium italic bg-amber-100/60 border border-amber-200 px-1.5 py-0.5 rounded mt-1 line-clamp-1">
                              « {personTag.label} »
                            </p>
                          )}
                        </div>

                        <div className="pt-1.5 border-t border-stone-200/60 flex items-center justify-between text-[10px] text-stone-500">
                          <span>{doc.place || 'Lieu inconnu'}</span>
                          <span className="text-amber-800 font-semibold group-hover:underline">
                            Voir sur la photo →
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Documents d'archives numérisés rattachés */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider font-mono text-stone-500 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                <span>Archives Numérisées Rattachées ({personArchives.length})</span>
              </h2>
              <button
                onClick={onOpenArchives}
                className="text-xs text-amber-800 hover:underline font-medium"
              >
                Gérer les archives →
              </button>
            </div>

            {personArchives.length === 0 ? (
              <div className="p-6 text-center bg-stone-50 rounded-xl border border-dashed border-stone-200 text-xs text-stone-500">
                Aucun document d'archive numérisé n'est encore rattaché à cette fiche.
                <button
                  onClick={onOpenArchives}
                  className="block mx-auto mt-2 text-amber-800 font-semibold hover:underline"
                >
                  Numériser un acte dans l'atelier archives
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {personArchives.map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => {
                      onOpenArchives();
                      onSelectArchive(doc.id);
                    }}
                    className="p-3.5 rounded-xl border border-stone-200 hover:border-amber-700 hover:bg-amber-50/40 cursor-pointer transition-all flex items-start justify-between gap-3 text-left group"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-800" />
                        <h4 className="font-serif text-xs font-bold text-stone-900 group-hover:text-amber-900">
                          {doc.title}
                        </h4>
                      </div>
                      <div className="text-[11px] text-stone-500 mt-1 flex items-center gap-2">
                        <span>Cote : {doc.callNumber || 'N/A'}</span>
                        <span>·</span>
                        <span>{doc.archiveLocation || 'Dépôt public'}</span>
                      </div>
                      {doc.transcription && (
                        <p className="text-[11px] text-stone-600 font-serif italic mt-1.5 line-clamp-2">
                          "{doc.transcription}"
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-amber-800 font-medium shrink-0 pt-0.5">Ouvrir l'acte →</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recherche d'Archives & Salles de Lecture Numériques */}
          {(() => {
            const primaryPlace = person.birth?.place || person.death?.place || '';
            const detectedDept = extractDept(primaryPlace);
            const detectedDeptName = detectedDept ? deptName(detectedDept) : null;
            const detectedRegion = detectedDept ? region(detectedDept) : null;
            const adEntry = deptArchives(detectedDept);
            const researchLinks = linksFor({ person, place: primaryPlace });

            return (
              <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider font-mono text-stone-500 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-amber-800" />
                    <span>Recherche d'Archives & Salles en Ligne</span>
                  </h2>
                  {onOpenDeptDirectory && (
                    <button
                      onClick={onOpenDeptDirectory}
                      className="text-xs text-amber-800 hover:underline font-medium flex items-center gap-1"
                    >
                      <span>Annuaire des 97 AD</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {detectedDept && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="size-6 rounded-md bg-amber-200 text-amber-900 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                        {detectedDept}
                      </span>
                      <div>
                        <div className="font-semibold text-stone-900">
                          {detectedDeptName} {detectedRegion ? `(${detectedRegion})` : ''}
                        </div>
                        <div className="text-[11px] text-stone-500 font-mono">
                          Département détecté d'après : {primaryPlace}
                        </div>
                      </div>
                    </div>
                    {adEntry && (
                      <a
                        href={adEntry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-950 text-white font-semibold text-xs inline-flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs"
                      >
                        <span>{adEntry.label}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                  {researchLinks.filter(l => l.kind === 'portal').map((link) => (
                    <a
                      key={link.source}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 rounded-lg border border-stone-200 hover:border-amber-700 hover:bg-amber-50/40 text-stone-700 hover:text-stone-900 flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-stone-400 group-hover:text-amber-800 shrink-0" />
                        <span className="font-medium truncate">{link.label}</span>
                      </div>
                      <ExternalLink className="w-3 h-3 text-stone-400 group-hover:text-amber-800 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Notes biographiques */}
          {person.notes && person.notes.length > 0 && (
            <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-xs space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider font-mono text-stone-500">
                Notes Biographiques & Historiques
              </h2>
              <div className="space-y-1.5 text-xs text-stone-700 font-serif leading-relaxed italic">
                {person.notes.map((note, idx) => (
                  <p key={idx}>{note}</p>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Family Links (Parents, Spouses, Children, Siblings) (5 cols) */}
        <div className="md:col-span-5 space-y-6">
          
          {/* Parents */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-xs space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider font-mono text-stone-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-amber-800" />
              <span>Parents Directs</span>
            </h3>

            <div className="space-y-2">
              {father ? (
                <button
                  onClick={() => onSelectPerson(father.id)}
                  className="w-full p-2.5 rounded-xl border border-stone-200 hover:border-amber-700 hover:bg-amber-50/40 text-left transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="text-[10px] text-stone-400 uppercase font-mono block">Père</span>
                    <span className="font-serif text-xs font-bold text-stone-900">{father.name}</span>
                    <span className="text-[10px] text-stone-500 block">{father.birth?.date || ''} — {father.death?.date || ''}</span>
                  </div>
                  <span className="text-xs text-stone-400">→</span>
                </button>
              ) : (
                <p className="text-xs text-stone-400 italic">Père non renseigné</p>
              )}

              {mother ? (
                <button
                  onClick={() => onSelectPerson(mother.id)}
                  className="w-full p-2.5 rounded-xl border border-stone-200 hover:border-amber-700 hover:bg-amber-50/40 text-left transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="text-[10px] text-stone-400 uppercase font-mono block">Mère</span>
                    <span className="font-serif text-xs font-bold text-stone-900">{mother.name}</span>
                    <span className="text-[10px] text-stone-500 block">{mother.birth?.date || ''} — {mother.death?.date || ''}</span>
                  </div>
                  <span className="text-xs text-stone-400">→</span>
                </button>
              ) : (
                <p className="text-xs text-stone-400 italic">Mère non renseignée</p>
              )}
            </div>
          </div>

          {/* Unions & Enfants */}
          <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider font-mono text-stone-500 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-amber-800" />
              <span>Unions & Descendance</span>
            </h3>

            {marriages.length === 0 ? (
              <p className="text-xs text-stone-400 italic">Aucune union répertoriée.</p>
            ) : (
              marriages.map((m, mIdx) => (
                <div key={mIdx} className="space-y-3 pb-3 border-b border-stone-100 last:border-b-0 last:pb-0">
                  {m.spouse && (
                    <button
                      onClick={() => onSelectPerson(m.spouse!.id)}
                      className="w-full p-2.5 rounded-xl border border-stone-200 hover:border-amber-700 hover:bg-amber-50/40 text-left transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="text-[10px] text-stone-400 uppercase font-mono block">Époux(se)</span>
                        <span className="font-serif text-xs font-bold text-stone-900">{m.spouse.name}</span>
                        {m.marriageDate && (
                          <span className="text-[10px] text-stone-500 block">Mariage : {m.marriageDate} {m.marriagePlace ? `à ${m.marriagePlace.split(',')[0]}` : ''}</span>
                        )}
                      </div>
                      <span className="text-xs text-stone-400">→</span>
                    </button>
                  )}

                  {/* Children */}
                  <div className="pl-3 border-l-2 border-stone-200 space-y-1.5">
                    <span className="text-[10px] uppercase font-mono text-stone-400 block">Enfants ({m.children.length})</span>
                    {m.children.map(child => (
                      <button
                        key={child.id}
                        onClick={() => onSelectPerson(child.id)}
                        className="w-full text-left p-1.5 hover:bg-stone-50 rounded text-xs text-stone-800 flex items-center justify-between"
                      >
                        <span className="font-medium truncate">{child.name}</span>
                        <span className="text-[10px] text-stone-400 font-mono">{child.birth?.date || ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Frères & Sœurs */}
          {siblings.length > 0 && (
            <div className="bg-white border border-stone-200/90 rounded-2xl p-6 shadow-xs space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider font-mono text-stone-500">
                Fratrie ({siblings.length})
              </h3>
              <div className="space-y-1">
                {siblings.map(sib => (
                  <button
                    key={sib.id}
                    onClick={() => onSelectPerson(sib.id)}
                    className="w-full text-left p-1.5 hover:bg-stone-50 rounded text-xs text-stone-800 flex items-center justify-between"
                  >
                    <span className="font-medium truncate">{sib.name}</span>
                    <span className="text-[10px] text-stone-400 font-mono">{sib.birth?.date || ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
