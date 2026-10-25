import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Upload, ZoomIn, ZoomOut, RotateCw, Contrast, 
  Search, Filter, Plus, Calendar, MapPin, Building, 
  Link as LinkIcon, User, Users, Trash2, Edit2, Download,
  CheckCircle, BookOpen, Eye, X, Image as ImageIcon
} from 'lucide-react';
import { ArchiveDocument, ArchiveDocumentType, GenealogyData, Individual, PhotoTag } from '../../types/genealogy';
import { parseRepublicanDate } from '../../lib/republican-calendar';
import { PhotoTagger } from '../PhotoTagger';

interface ArchivesViewProps {
  archives: ArchiveDocument[];
  data: GenealogyData;
  selectedArchiveId?: string;
  onAddArchive?: (doc: ArchiveDocument) => void;
  onUpdateArchive?: (doc: ArchiveDocument) => void;
  onDeleteArchive?: (id: string) => void;
  onSelectPerson: (personId: string) => void;
}

const TYPE_LABELS: Record<ArchiveDocumentType, { label: string; color: string }> = {
  birth: { label: 'Naissance', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  baptism: { label: 'Baptême', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  marriage: { label: 'Mariage', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  death: { label: 'Décès', color: 'bg-rose-50 text-rose-800 border-rose-200' },
  burial: { label: 'Sépulture', color: 'bg-rose-50 text-rose-800 border-rose-200' },
  census: { label: 'Recensement', color: 'bg-blue-50 text-blue-800 border-blue-200' },
  notarial: { label: 'Notarié / Contrat', color: 'bg-purple-50 text-purple-800 border-purple-200' },
  military: { label: 'Matricule Militaire', color: 'bg-stone-100 text-stone-800 border-stone-300' },
  livret: { label: 'Livret de famille', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  photo: { label: 'Photographie / Portrait', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  other: { label: 'Autre document', color: 'bg-stone-50 text-stone-700 border-stone-200' },
};

export const ArchivesView: React.FC<ArchivesViewProps> = ({
  archives,
  data,
  selectedArchiveId,
  onAddArchive,
  onUpdateArchive,
  onDeleteArchive,
  onSelectPerson,
}) => {
  const [selectedDocId, setSelectedDocId] = useState<string>(selectedArchiveId || archives[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (selectedArchiveId) {
      setSelectedDocId(selectedArchiveId);
    }
  }, [selectedArchiveId]);

  // Viewer image transformation states
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [filterMode, setFilterMode] = useState<'normal' | 'contrast' | 'invert' | 'grayscale'>('normal');

  // Form states for creating or editing archive
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<ArchiveDocumentType>('birth');
  const [formLocation, setFormLocation] = useState('');
  const [formCallNumber, setFormCallNumber] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formPlace, setFormPlace] = useState('');
  const [formTranscription, setFormTranscription] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formLinkedPersons, setFormLinkedPersons] = useState<string[]>([]);
  const [formFileData, setFormFileData] = useState<string | undefined>(undefined);
  const [formFileName, setFormFileName] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDoc = archives.find(a => a.id === selectedDocId);

  // Filter archives list
  const filteredArchives = archives.filter(doc => {
    const matchesType = filterType === 'all' || doc.type === filterType;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q ||
      doc.title.toLowerCase().includes(q) ||
      (doc.place && doc.place.toLowerCase().includes(q)) ||
      (doc.callNumber && doc.callNumber.toLowerCase().includes(q)) ||
      (doc.date && doc.date.toLowerCase().includes(q)) ||
      (doc.transcription && doc.transcription.toLowerCase().includes(q));
    return matchesType && matchesSearch;
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormFileName(file.name);
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setFormFileData(uploadEvent.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleStartCreate = () => {
    setFormTitle('');
    setFormType('birth');
    setFormLocation('Archives Départementales');
    setFormCallNumber('');
    setFormDate('');
    setFormPlace('');
    setFormTranscription('');
    setFormNotes('');
    setFormLinkedPersons([]);
    setFormFileData(undefined);
    setFormFileName(undefined);
    setIsCreating(true);
    setIsEditing(false);
  };

  const handleStartEdit = (doc: ArchiveDocument) => {
    setFormTitle(doc.title);
    setFormType(doc.type);
    setFormLocation(doc.archiveLocation || '');
    setFormCallNumber(doc.callNumber || '');
    setFormDate(doc.date || '');
    setFormPlace(doc.place || '');
    setFormTranscription(doc.transcription || '');
    setFormNotes(doc.notes || '');
    setFormLinkedPersons(doc.linkedPersonIds || []);
    setFormFileData(doc.fileData);
    setFormFileName(doc.fileName);
    setIsEditing(true);
    setIsCreating(false);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();

    // Check for republican date conversion
    const repCheck = parseRepublicanDate(formDate);
    const repDateFormatted = repCheck.isValid ? `${formDate} (${repCheck.gregorianApprox})` : undefined;

    if (isCreating) {
      const newDoc: ArchiveDocument = {
        id: 'doc-' + Date.now(),
        title: formTitle.trim() || `Acte de ${TYPE_LABELS[formType].label}`,
        type: formType,
        archiveLocation: formLocation.trim() || undefined,
        callNumber: formCallNumber.trim() || undefined,
        date: formDate.trim() || undefined,
        republicanDate: repDateFormatted,
        place: formPlace.trim() || undefined,
        transcription: formTranscription.trim() || undefined,
        notes: formNotes.trim() || undefined,
        fileData: formFileData,
        fileName: formFileName,
        linkedPersonIds: formLinkedPersons,
        linkedFamilyIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      onAddArchive?.(newDoc);
      setSelectedDocId(newDoc.id);
      setIsCreating(false);
    } else if (isEditing && selectedDoc) {
      const updatedDoc: ArchiveDocument = {
        ...selectedDoc,
        title: formTitle.trim() || selectedDoc.title,
        type: formType,
        archiveLocation: formLocation.trim() || undefined,
        callNumber: formCallNumber.trim() || undefined,
        date: formDate.trim() || undefined,
        republicanDate: repDateFormatted,
        place: formPlace.trim() || undefined,
        transcription: formTranscription.trim() || undefined,
        notes: formNotes.trim() || undefined,
        fileData: formFileData || selectedDoc.fileData,
        fileName: formFileName || selectedDoc.fileName,
        linkedPersonIds: formLinkedPersons,
        updatedAt: Date.now(),
      };
      onUpdateArchive?.(updatedDoc);
      setIsEditing(false);
    }
  };

  const toggleLinkedPerson = (personId: string) => {
    setFormLinkedPersons(prev =>
      prev.includes(personId) ? prev.filter(id => id !== personId) : [...prev, personId]
    );
  };

  const handleUpdateDocumentTags = (tags: PhotoTag[]) => {
    if (!selectedDoc) return;
    const tagPersonIds = tags.map(t => t.personId);
    const mergedPersons = Array.from(new Set([...(selectedDoc.linkedPersonIds || []), ...tagPersonIds]));
    const updatedDoc: ArchiveDocument = {
      ...selectedDoc,
      photoTags: tags,
      linkedPersonIds: mergedPersons,
      updatedAt: Date.now(),
    };
    onUpdateArchive?.(updatedDoc);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
      
      {/* Title & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200/80 pb-4">
        <div>
          <span className="text-xs uppercase tracking-widest font-mono text-stone-500">
            FONDS D'ARCHIVES & NUMÉRISATIONS NUMÉROTEES
          </span>
          <h1 className="font-serif text-3xl font-bold text-stone-900 mt-1">
            Registres Paroissiaux, État Civil & Photographies
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Importez des photographies anciennes et des actes numérisés. Taguez précisément chaque visage pour créer un lien direct vers la fiche de vos ancêtres.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onAddArchive ? (
            <button
              onClick={handleStartCreate}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Numériser un Document ou Photo</span>
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg shadow-2xs">
              <Eye className="w-3.5 h-3.5 text-amber-800" />
              <span>Profil Lecteur (Consultation des archives)</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Left Catalog & Right Archive Detail/Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Archive Document List & Filters (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Search & Type filter */}
          <div className="bg-white p-3 rounded-xl border border-stone-200/80 shadow-2xs space-y-2.5">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher cote, commune, date, type..."
                className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg pl-8 pr-3 py-1.5 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-800"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2" />
            </div>

            {/* Type selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                  filterType === 'all' ? 'bg-amber-100 text-amber-900 font-medium' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Tous ({archives.length})
              </button>
              <button
                onClick={() => setFilterType('photo')}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                  filterType === 'photo' ? 'bg-amber-100 text-amber-900 font-medium' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Photos ({archives.filter(a => a.type === 'photo').length})
              </button>
              <button
                onClick={() => setFilterType('birth')}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                  filterType === 'birth' ? 'bg-amber-100 text-amber-900 font-medium' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Naissances
              </button>
              <button
                onClick={() => setFilterType('marriage')}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                  filterType === 'marriage' ? 'bg-amber-100 text-amber-900 font-medium' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Mariages
              </button>
              <button
                onClick={() => setFilterType('death')}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                  filterType === 'death' ? 'bg-amber-100 text-amber-900 font-medium' : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Décès
              </button>
            </div>
          </div>

          {/* List of Documents */}
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {filteredArchives.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-dashed border-stone-200 text-xs text-stone-500">
                Aucun acte ne correspond à votre filtre.
              </div>
            ) : (
              filteredArchives.map(doc => {
                const isSelected = doc.id === selectedDocId;
                const typeInfo = TYPE_LABELS[doc.type] || TYPE_LABELS.other;

                return (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setSelectedDocId(doc.id);
                      setIsCreating(false);
                      setIsEditing(false);
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all text-left ${
                      isSelected
                        ? 'bg-amber-50/70 border-amber-700 shadow-xs ring-1 ring-amber-700'
                        : 'bg-white border-stone-200 hover:border-stone-300 hover:bg-stone-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      {doc.date && (
                        <span className="text-[11px] font-mono text-stone-500">{doc.date}</span>
                      )}
                    </div>

                    <h3 className="font-serif text-sm font-semibold text-stone-900 mt-1.5 line-clamp-1">
                      {doc.title}
                    </h3>

                    <div className="mt-2 flex items-center gap-2 text-[11px] text-stone-500">
                      {doc.place && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-stone-400" />
                          <span className="truncate max-w-[140px]">{doc.place}</span>
                        </span>
                      )}
                      {doc.callNumber && (
                        <>
                          <span>·</span>
                          <span className="font-mono text-stone-500">{doc.callNumber}</span>
                        </>
                      )}
                    </div>

                    {/* Linked persons indicators */}
                    {doc.linkedPersonIds && doc.linkedPersonIds.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-stone-100 flex items-center gap-1 text-[11px] text-stone-600">
                        <Users className="w-3 h-3 text-amber-800" />
                        <span>{doc.linkedPersonIds.length} individu(s) lié(s)</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: High-Res Archive Viewer & Document Sheet (8 cols) */}
        <div className="lg:col-span-8">
          {isCreating || isEditing ? (
            /* Editing / Creating Form */
            <form onSubmit={handleSaveForm} className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                <h2 className="font-serif text-lg font-bold text-stone-900">
                  {isCreating ? 'Numériser & Indexer un Nouvel Acte' : 'Modifier les Métadonnées de l\'Archive'}
                </h2>
                <button
                  type="button"
                  onClick={() => { setIsCreating(false); setIsEditing(false); }}
                  className="text-stone-400 hover:text-stone-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Fichier de scan */}
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5">
                  Scan ou photographie du registre
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="p-6 border-2 border-dashed border-stone-200 hover:border-amber-700 rounded-xl bg-stone-50/60 cursor-pointer text-center transition-all"
                >
                  <Upload className="w-6 h-6 text-amber-800 mx-auto mb-2" />
                  <span className="text-xs font-medium text-stone-800 block">
                    {formFileName ? formFileName : 'Cliquez pour charger un document (JPEG, PNG, WEBP)'}
                  </span>
                  <span className="text-[10px] text-stone-400">Glissez-déposez le fichier du registre paroissial ou d\'état civil</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
                {formFileData && (
                  <div className="mt-2 text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Fichier prêt à être lié</span>
                  </div>
                )}
              </div>

              {/* Titre et Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Titre descriptif de l'acte
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="Ex: Acte de naissance de Pierre Martin (1742)"
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Typologie de la pièce
                  </label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as ArchiveDocumentType)}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  >
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dépôt & Cote */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Dépôt d'archives / Mairie
                  </label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={e => setFormLocation(e.target.value)}
                    placeholder="Ex: AD Ille-et-Vilaine ou Mairie de Saint-Malo"
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Cote & numéro de vue
                  </label>
                  <input
                    type="text"
                    value={formCallNumber}
                    onChange={e => setFormCallNumber(e.target.value)}
                    placeholder="Ex: 10 NUM 35001 23, vue 42/180"
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                </div>
              </div>

              {/* Date & Commune */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Date de l'acte (Grégorienne ou Républicaine)
                  </label>
                  <input
                    type="text"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    placeholder="Ex: 14 mai 1742 ou 18 Brumaire an II"
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-stone-700 mb-1">
                    Commune / Paroisse
                  </label>
                  <input
                    type="text"
                    value={formPlace}
                    onChange={e => setFormPlace(e.target.value)}
                    placeholder="Ex: Saint-Malo (Paroisse Saint-Vincent)"
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
                  />
                </div>
              </div>

              {/* Transcription */}
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1">
                  Transcription textuelle fidèle de l'acte
                </label>
                <textarea
                  rows={4}
                  value={formTranscription}
                  onChange={e => setFormTranscription(e.target.value)}
                  placeholder="L'an mil sept cent quarante-deux, le quatorzième jour de may, a esté baptisé par moy soussigné vicaire..."
                  className="w-full text-xs font-serif bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
                />
              </div>

              {/* Association manuelle aux personnes de l'arbre */}
              <div>
                <label className="block text-xs font-medium text-stone-700 mb-1.5">
                  Rattacher manuellement aux fiches de l'arbre généalogique
                </label>
                <div className="border border-stone-200 rounded-lg p-2.5 max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-stone-50/50">
                  {Object.values(data.individuals).map(ind => {
                    const isLinked = formLinkedPersons.includes(ind.id);
                    return (
                      <button
                        type="button"
                        key={ind.id}
                        onClick={() => toggleLinkedPerson(ind.id)}
                        className={`flex items-center gap-2 p-1.5 rounded text-left text-xs transition-colors ${
                          isLinked ? 'bg-amber-100 text-amber-950 font-semibold' : 'text-stone-700 hover:bg-stone-200/60'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded flex items-center justify-center border text-[9px] ${
                          isLinked ? 'bg-amber-800 text-white border-amber-800' : 'border-stone-300'
                        }`}>
                          {isLinked && '✓'}
                        </span>
                        <span className="truncate">{ind.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => { setIsCreating(false); setIsEditing(false); }}
                  className="px-4 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shadow-sm"
                >
                  Enregistrer l'Archive
                </button>
              </div>
            </form>
          ) : selectedDoc ? (
            /* Selected Document View with High-Res Zoomable Visualizer */
            <div className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden space-y-6">
              
              {/* Top toolbar */}
              <div className="p-4 bg-stone-100/70 border-b border-stone-200/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-mono uppercase px-2 py-0.5 rounded border ${TYPE_LABELS[selectedDoc.type]?.color}`}>
                    {TYPE_LABELS[selectedDoc.type]?.label}
                  </span>
                  <h2 className="font-serif text-lg font-bold text-stone-900">
                    {selectedDoc.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2">
                  {onUpdateArchive && (
                    <button
                      onClick={() => handleStartEdit(selectedDoc)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 rounded-lg shadow-2xs cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Modifier</span>
                    </button>
                  )}
                  {onDeleteArchive && (
                    <button
                      onClick={() => {
                        if (confirm('Voulez-vous supprimer ce document d\'archive ?')) {
                          onDeleteArchive(selectedDoc.id);
                        }
                      }}
                      className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* High-Definition Visualizer Container with Photo Tagging */}
              <div className="px-6">
                {selectedDoc.fileData ? (
                  <PhotoTagger
                    document={selectedDoc}
                    data={data}
                    onUpdateTags={handleUpdateDocumentTags}
                    onSelectPerson={onSelectPerson}
                  />
                ) : (
                  /* Default Historic Archival Certificate Rendering */
                  <div className="bg-stone-900 rounded-xl overflow-hidden relative min-h-[320px] flex flex-col items-center justify-center p-6 select-none">
                    <div className="w-full max-w-lg p-6 bg-[#F7F4EE] text-stone-900 border-4 border-double border-amber-900/30 rounded-lg shadow-inner font-serif transition-transform">
                      <div className="text-center border-b border-stone-300 pb-2 mb-3">
                        <span className="text-[10px] tracking-widest uppercase font-mono text-stone-600 block">
                          EXTRAIT DU REGISTRE DES ACTES DE {selectedDoc.type.toUpperCase()}
                        </span>
                        <span className="text-base font-bold text-amber-950">
                          {selectedDoc.archiveLocation || 'Archives Publiques'}
                        </span>
                      </div>

                      <div className="text-xs leading-relaxed italic text-stone-800 space-y-2">
                        {selectedDoc.transcription ? (
                          <p className="whitespace-pre-line">{selectedDoc.transcription}</p>
                        ) : (
                          <p>Acte numérisé disponible en cote {selectedDoc.callNumber || 'N/A'}.</p>
                        )}
                      </div>

                      <div className="mt-4 pt-2 border-t border-stone-300/80 flex items-center justify-between text-[10px] font-mono text-stone-600">
                        <span>Cote : {selectedDoc.callNumber || 'Registre paroissial'}</span>
                        <span>{selectedDoc.date}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Archival Metadata Details & Transcription */}
              <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Left: Metadata Definition List */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 font-mono">
                    Métadonnées Archivo-Généalogiques
                  </h3>

                  <dl className="space-y-2.5 text-xs">
                    <div className="flex items-start justify-between border-b border-stone-100 pb-1.5">
                      <dt className="text-stone-500 font-medium">Lieu de conservation</dt>
                      <dd className="font-medium text-stone-900 text-right">{selectedDoc.archiveLocation || 'Non renseigné'}</dd>
                    </div>

                    <div className="flex items-start justify-between border-b border-stone-100 pb-1.5">
                      <dt className="text-stone-500 font-medium">Cote d'archive</dt>
                      <dd className="font-mono text-stone-900 text-right">{selectedDoc.callNumber || 'N/A'}</dd>
                    </div>

                    <div className="flex items-start justify-between border-b border-stone-100 pb-1.5">
                      <dt className="text-stone-500 font-medium">Date</dt>
                      <dd className="font-mono text-stone-900 text-right">{selectedDoc.date || 'Non daté'}</dd>
                    </div>

                    {selectedDoc.republicanDate && (
                      <div className="flex items-start justify-between border-b border-stone-100 pb-1.5 bg-amber-50/50 p-1.5 rounded">
                        <dt className="text-amber-900 font-medium">Calendrier Républicain</dt>
                        <dd className="font-mono text-amber-950 font-bold text-right">{selectedDoc.republicanDate}</dd>
                      </div>
                    )}

                    <div className="flex items-start justify-between border-b border-stone-100 pb-1.5">
                      <dt className="text-stone-500 font-medium">Lieu / Paroisse</dt>
                      <dd className="font-medium text-stone-900 text-right">{selectedDoc.place || 'Non précisé'}</dd>
                    </div>
                  </dl>

                  {/* Persons linked */}
                  <div className="pt-2">
                    <h4 className="text-xs font-semibold text-stone-700 mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-amber-800" />
                      <span>Personnes citées dans cet acte</span>
                    </h4>

                    {selectedDoc.linkedPersonIds && selectedDoc.linkedPersonIds.length > 0 ? (
                      <div className="space-y-1.5">
                        {selectedDoc.linkedPersonIds.map(pId => {
                          const person = data.individuals[pId];
                          if (!person) return null;
                          return (
                            <button
                              key={pId}
                              onClick={() => onSelectPerson(pId)}
                              className="w-full flex items-center justify-between p-2 rounded-lg bg-stone-50 hover:bg-amber-50 text-xs text-stone-900 hover:text-amber-900 border border-stone-200 transition-colors text-left"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${person.sex === 'M' ? 'bg-blue-600' : 'bg-rose-500'}`} />
                                <span className="font-medium">{person.name}</span>
                              </div>
                              <span className="text-[10px] text-stone-500">Voir la fiche →</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-500 italic">Aucun individu relié. Cliquez sur Modifier pour l'associer à une personne de l'arbre.</p>
                    )}
                  </div>
                </div>

                {/* Right: Transcription text */}
                <div className="space-y-3 bg-[#FBF9F5] p-4 rounded-xl border border-stone-200">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500 font-mono flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-amber-800" />
                    <span>Transcription intégrale</span>
                  </h3>

                  {selectedDoc.transcription ? (
                    <div className="font-serif text-xs leading-relaxed text-stone-800 bg-white p-3.5 rounded-lg border border-stone-200/80 shadow-2xs whitespace-pre-line">
                      {selectedDoc.transcription}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-stone-500 italic bg-white rounded-lg border border-stone-200">
                      Aucune transcription saisie pour le moment.
                    </div>
                  )}

                  {selectedDoc.notes && (
                    <div className="text-[11px] text-stone-600 pt-2 border-t border-stone-200">
                      <strong className="text-stone-800 font-medium">Notes paléographiques :</strong> {selectedDoc.notes}
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white border border-dashed border-stone-200 rounded-2xl">
              <BookOpen className="w-8 h-8 text-stone-400 mx-auto mb-2" />
              <p className="text-sm font-serif text-stone-700">Sélectionnez un document d'archive à gauche ou numérisez un nouvel acte.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
