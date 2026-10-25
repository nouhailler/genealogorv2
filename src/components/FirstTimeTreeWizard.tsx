import React, { useState, useRef, useEffect } from 'react';
import { 
  FolderTree, 
  Upload, 
  Check, 
  AlertCircle, 
  Sparkles, 
  Trash2, 
  ArrowRight, 
  UserPlus, 
  FileText,
  RotateCcw,
  X
} from 'lucide-react';
import { Logo } from './Logo';
import { parseGedcom } from '../lib/gedcom-parser';
import { 
  slugifyTreeId, 
  isValidTreeId, 
  markTreeCreatedLocally, 
  recordKnownTree,
  markFirstTreeCreated,
  deleteTreeCompletely,
  getKnownTrees
} from '../lib/tree-manager';
import { createEmptyGenealogy } from '../lib/sample-data';
import type { GenealogyData } from '../types/genealogy';

interface FirstTimeTreeWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onTreeCreatedAndLoaded: (treeId: string, title: string, data: GenealogyData) => void;
  /** Arbre déjà créé (gestionnaire d'arbres) : l'assistant s'ouvre directement à l'étape 2 (import .GED) */
  existingTree?: { id: string; title: string; personCount?: number } | null;
  /** Appelé après la suppression de l'arbre via « Supprimer cet arbre et recommencer » */
  onTreeDeleted?: (treeId: string) => void;
  /** Autorise la fermeture (par défaut : seulement pour un arbre existant) */
  dismissable?: boolean;
}

export const FirstTimeTreeWizard: React.FC<FirstTimeTreeWizardProps> = ({
  isOpen,
  onClose,
  onTreeCreatedAndLoaded,
  existingTree,
  onTreeDeleted,
  dismissable,
}) => {
  // Hors première utilisation, l'assistant peut être fermé
  const isDismissable = dismissable ?? Boolean(existingTree);

  // Wizard steps: 1 = Création de l'arbre, 2 = Alimentation (Import GEDCOM ou Manuel)
  const [step, setStep] = useState<1 | 2>(1);

  // Étape 1 state
  const [treeTitle, setTreeTitle] = useState('');
  const [treeSlug, setTreeSlug] = useState('');
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Created tree info for Step 2
  const [createdTreeId, setCreatedTreeId] = useState('');
  const [createdTreeTitle, setCreatedTreeTitle] = useState('');

  // Étape 2 state (GEDCOM)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<GenealogyData | null>(null);
  const [importStats, setImportStats] = useState<{ individuals: number; families: number } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Repartir d'un assistant vierge à chaque ouverture (ex. après suppression du dernier arbre)
  useEffect(() => {
    if (!isOpen) return;
    setStep(existingTree ? 2 : 1);
    setTreeTitle('');
    setTreeSlug('');
    setIsSlugManuallyEdited(false);
    setDescription('');
    setError(null);
    setCreatedTreeId(existingTree?.id || '');
    setCreatedTreeTitle(existingTree?.title || '');
    setSelectedFile(null);
    setParsedData(null);
    setImportStats(null);
    setImportError(null);
  }, [isOpen, existingTree]);

  if (!isOpen) return null;

  // Handle title input change
  const handleTitleChange = (val: string) => {
    setTreeTitle(val);
    if (!isSlugManuallyEdited) {
      setTreeSlug(slugifyTreeId(val));
    }
    setError(null);
  };

  const handleSlugChange = (val: string) => {
    setIsSlugManuallyEdited(true);
    setTreeSlug(slugifyTreeId(val));
    setError(null);
  };

  // Step 1: Submit Tree Creation
  const handleCreateTreeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = treeTitle.trim();
    if (!cleanTitle) {
      setError('Veuillez renseigner un nom pour votre arbre ou votre famille.');
      return;
    }

    const cleanSlug = slugifyTreeId(treeSlug || cleanTitle);
    if (!isValidTreeId(cleanSlug)) {
      setError('L\'identifiant de salon doit comporter entre 3 et 64 caractères (lettres minuscules, chiffres, tirets).');
      return;
    }

    if (getKnownTrees().some(t => t.id === cleanSlug)) {
      setError(`L'identifiant « ${cleanSlug} » est déjà utilisé par un de vos arbres. Choisissez-en un autre.`);
      return;
    }

    // Enregistrer localement comme arbre créé par l'administrateur
    markTreeCreatedLocally(cleanSlug);
    markFirstTreeCreated();

    recordKnownTree({
      id: cleanSlug,
      title: cleanTitle,
      description: description.trim() || undefined,
      personCount: 0,
      isCreator: true,
      lastOpenedAt: Date.now(),
    });

    setCreatedTreeId(cleanSlug);
    setCreatedTreeTitle(cleanTitle);
    setStep(2);
    setError(null);
  };

  // Step 2: Handle GEDCOM file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSelectedFile(file);
    setIsParsing(true);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseGedcom(text);
        const indCount = Object.keys(parsed.individuals).length;
        const famCount = Object.keys(parsed.families).length;

        if (indCount === 0) {
          setImportError('Le fichier sélectionné ne semble contenir aucun individu au format GEDCOM valide.');
          setParsedData(null);
          setImportStats(null);
        } else {
          parsed.sourceHeader = createdTreeTitle;
          setParsedData(parsed);
          setImportStats({ individuals: indCount, families: famCount });
        }
      } catch (err: any) {
        setImportError(`Erreur lors de la lecture du fichier GEDCOM : ${err?.message || 'Format non reconnu'}`);
        setParsedData(null);
        setImportStats(null);
      } finally {
        setIsParsing(false);
      }
    };
    reader.onerror = () => {
      setImportError('Impossible de lire le fichier.');
      setIsParsing(false);
    };
    reader.readAsText(file);
  };

  // Step 2: Confirm GEDCOM Import
  const handleConfirmImport = () => {
    if (!parsedData || !createdTreeId) return;

    recordKnownTree({
      id: createdTreeId,
      title: createdTreeTitle,
      personCount: Object.keys(parsedData.individuals).length,
      isCreator: true,
      lastOpenedAt: Date.now(),
    });

    onTreeCreatedAndLoaded(createdTreeId, createdTreeTitle, parsedData);
    onClose();
  };

  // Step 2: Skip import and start with empty tree
  const handleStartManual = () => {
    const emptyData = createEmptyGenealogy(createdTreeTitle);
    onTreeCreatedAndLoaded(createdTreeId, createdTreeTitle, emptyData);
    onClose();
  };

  // Abort / Delete tree if import went wrong or mistake made
  const handleDeleteAndRestart = async () => {
    if (createdTreeId) {
      await deleteTreeCompletely(createdTreeId, null);
      onTreeDeleted?.(createdTreeId);
    }
    setStep(1);
    setSelectedFile(null);
    setParsedData(null);
    setImportStats(null);
    setImportError(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-title"
        className="bg-[#FBF9F5] dark:bg-[#1A1D24] border border-stone-300 dark:border-stone-700 shadow-2xl rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-stone-900 dark:text-stone-100 transition-colors"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200/80 dark:border-stone-800 bg-stone-100/70 dark:bg-stone-900/50">
          <div className="flex items-center gap-3">
            <Logo size="sm" showText={true} />
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800">
              👑 Assistant Administrateur
            </span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
              step === 1 ? 'bg-amber-900 text-white' : 'bg-emerald-600 text-white'
            }`}>
              {step === 1 ? '1' : '✓'}
            </span>
            <span className="text-stone-400">→</span>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
              step === 2 ? 'bg-amber-900 text-white' : 'bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
            }`}>
              2
            </span>
            {isDismissable && (
              <button
                type="button"
                onClick={onClose}
                className="ml-2 p-1 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-100 rounded-lg hover:bg-stone-200/50 dark:hover:bg-stone-800 cursor-pointer"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* ÉTAPE 1 : CRÉATION DE L'ARBRE */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="space-y-1">
                <h2 id="wizard-title" className="font-serif text-2xl font-bold text-stone-950 dark:text-stone-100">
                  Étape 1 : Créer votre arbre généalogique
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">
                  Avant d'importer vos données ou de saisir vos ancêtres, donnez un nom à votre arbre pour en être l'administrateur.
                </p>
              </div>

              {error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleCreateTreeSubmit} className="space-y-4">
                <div className="bg-white dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 rounded-xl p-4 sm:p-5 space-y-4 shadow-2xs">
                  {/* Nom de l'arbre */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider font-mono text-stone-700 dark:text-stone-300 mb-1.5">
                      Nom de la Famille ou Titre de l'Arbre *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Famille Coste, Généalogie Martin, Maison de Rohan..."
                      value={treeTitle}
                      onChange={e => handleTitleChange(e.target.value)}
                      className="w-full text-sm bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-xl px-3.5 py-2.5 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-800"
                    />
                    <p className="text-[11px] text-stone-500 mt-1">
                      Ce titre s'affichera dans l'en-tête, sur les fiches et dans le gestionnaire multi-arbres.
                    </p>
                  </div>

                  {/* Identifiant unique de salon */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider font-mono text-stone-700 dark:text-stone-300 mb-1.5">
                      Identifiant technique (Salon Cloud) *
                    </label>
                    <div className="flex items-center">
                      <span className="text-xs font-mono text-stone-400 bg-stone-100 dark:bg-stone-800 px-3 py-2.5 rounded-l-xl border border-r-0 border-stone-300 dark:border-stone-700">
                        genealogor.app/?room=
                      </span>
                      <input
                        type="text"
                        required
                        value={treeSlug}
                        onChange={e => handleSlugChange(e.target.value)}
                        placeholder="famille-coste"
                        className="flex-1 text-xs font-mono bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-r-xl px-3 py-2.5 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-800"
                      />
                    </div>
                    <p className="text-[11px] text-stone-500 mt-1">
                      Identifiant unique utilisé pour la synchronisation sécurisée et le partage de l'arbre.
                    </p>
                  </div>

                  {/* Description facultative */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider font-mono text-stone-700 dark:text-stone-300 mb-1.5">
                      Description ou Notes d'Origine (Optionnel)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Branche limousine et périgourdine, XVIIe - XXe siècle..."
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full text-xs bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded-xl px-3.5 py-2 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-amber-800"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-stone-500 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    <span>L'étape suivante vous permettra d'importer votre fichier .GED</span>
                  </div>

                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-amber-900 hover:bg-amber-950 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>Créer l'arbre et continuer</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ÉTAPE 2 : ALIMENTATION DE L'ARBRE (IMPORT GEDCOM OU SAISIE MANUELLE) */}
          {step === 2 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-xs font-mono">
                  <Check className="w-4 h-4" />
                  <span>Arbre « {createdTreeTitle} » {existingTree ? 'prêt à être alimenté' : 'créé avec succès'}</span>
                </div>
                <h2 className="font-serif text-2xl font-bold text-stone-950 dark:text-stone-100">
                  Étape 2 : Alimenter votre arbre généalogique
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400">
                  Importez votre fichier généalogique standard <strong>.GED</strong>, ou démarrez directement la saisie du premier ancêtre.
                </p>
              </div>

              {(existingTree?.personCount ?? 0) > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl text-xs text-amber-900 dark:text-amber-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Cet arbre contient déjà {existingTree!.personCount} individu(s) : l'import les remplacera.
                    Exportez une sauvegarde avant si nécessaire.
                  </span>
                </div>
              )}

              {importError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Zone principale : Import GEDCOM */}
              <div className="bg-white dark:bg-stone-900/60 border border-stone-200 dark:border-stone-800 rounded-xl p-5 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-base font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-800" />
                    <span>Option 1 : Importer un fichier GEDCOM (.ged)</span>
                  </h3>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                    Recommandé
                  </span>
                </div>

                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-6 border-2 border-dashed border-stone-300 dark:border-stone-700 hover:border-amber-700 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 rounded-xl text-center cursor-pointer transition-all space-y-2 group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".ged,.gedcom"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-12 h-12 mx-auto rounded-xl bg-amber-100/80 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6 text-amber-800 dark:text-amber-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900 dark:text-stone-100 group-hover:text-amber-900 block">
                      {selectedFile ? selectedFile.name : 'Cliquez ici ou déposez votre fichier .GED'}
                    </span>
                    <span className="text-[11px] text-stone-500 block mt-0.5">
                      Formats compatibles : GEDCOM 5.5, 5.5.1 et 7.0 (Geneanet, Heredis, Filae, FamilySearch...)
                    </span>
                  </div>
                </div>

                {/* Prévisualisation des données lues */}
                {isParsing && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 animate-spin text-amber-800" />
                    <span>Analyse du fichier GEDCOM en cours...</span>
                  </div>
                )}

                {importStats && (
                  <div className="p-4 bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-200 text-emerald-900 font-bold">
                        ✓
                      </div>
                      <div>
                        <span className="font-bold text-emerald-950 dark:text-emerald-200 block">
                          Fichier valide et prêt pour l'arbre « {createdTreeTitle} »
                        </span>
                        <span className="text-[11px] text-emerald-800 dark:text-emerald-300 font-mono">
                          {importStats.individuals} individu(s) et {importStats.families} famille(s) détectés
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <span>Finaliser & Ouvrir l'Arbre</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Option 2 : Commencer vierge */}
              <div className="bg-stone-50 dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-xl p-4 flex items-center justify-between gap-3 text-xs">
                <div>
                  <h4 className="font-bold text-stone-800 dark:text-stone-200">
                    Option 2 : Saisir manuellement le premier individu
                  </h4>
                  <p className="text-[11px] text-stone-500">
                    Si vous n'avez pas de fichier .GED, partez d'un arbre vierge et commencez à saisir vos ancêtres.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleStartManual}
                  className="px-3.5 py-2 bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-semibold rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  Partir d'un arbre vierge →
                </button>
              </div>

              {/* Option de suppression / annulation si erreur ou import mal passé */}
              <div className="pt-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between text-xs text-stone-500">
                <span className="text-[11px]">
                  Vous vous êtes trompé de nom ou l'import a échoué ?
                </span>
                <button
                  type="button"
                  onClick={handleDeleteAndRestart}
                  className="text-rose-700 dark:text-rose-400 hover:text-rose-800 hover:underline flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer cet arbre et recommencer</span>
                </button>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
