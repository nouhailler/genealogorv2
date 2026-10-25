import React, { useRef, useState } from 'react';
import { 
  X, Download, Upload, FileText, Database, RotateCcw, Check, ShieldCheck, 
  AlertCircle, Eye, Undo2, Trash2, AlertTriangle, Lock, Key, ShieldAlert, EyeOff 
} from 'lucide-react';
import { GenealogyData, ArchiveDocument, BranchAccess } from '../types/genealogy';
import { serializeGedcomWithReport } from '../lib/gedcom-serializer';
import { parseGedcom } from '../lib/gedcom-parser';
import { createFullBackup, previewBackup, restoreBackup, restorePreBackupSafety, BackupPreview } from '../lib/backup-restore';
import { sanitizeGenealogyDataForPrivacy, sanitizeArchivesForPrivacy, getProtectedPersonIds } from '../lib/privacy';
import { evaluatePassphraseQuality } from '../lib/crypto';

interface ExportImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: GenealogyData;
  archives: ArchiveDocument[];
  accessList: BranchAccess[];
  onLoadGedcom: (newData: GenealogyData) => void;
  onRestoreBackup: (payload: { genealogy: GenealogyData; archives: ArchiveDocument[]; accessList: BranchAccess[] }) => void;
  onClearTree?: () => void;
  userRole?: import('../types/genealogy').BranchRole;
}

export const ExportImportModal: React.FC<ExportImportModalProps> = ({
  isOpen,
  onClose,
  data,
  archives,
  accessList,
  onLoadGedcom,
  onRestoreBackup,
  onClearTree,
  userRole = 'viewer',
}) => {
  const fileInputGedRef = useRef<HTMLInputElement>(null);
  const fileInputBackupRef = useRef<HTMLInputElement>(null);

  const [applyPrivacyOnBackup, setApplyPrivacyOnBackup] = useState(false);
  const [hideLivingOnExport, setHideLivingOnExport] = useState(false);
  
  // États d'export de sauvegarde explicite
  const [exportMode, setExportMode] = useState<'encrypted' | 'plain'>('encrypted');
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [confirmExportPassphrase, setConfirmExportPassphrase] = useState('');
  const [showPassphraseText, setShowPassphraseText] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [pendingBackupContent, setPendingBackupContent] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  if (!isOpen) return null;

  const getEffectiveBackupData = () => {
    if (!applyPrivacyOnBackup) {
      return { exportData: data, exportArchives: archives };
    }
    const sanitizedTree = sanitizeGenealogyDataForPrivacy(data);
    const protectedIds = getProtectedPersonIds(data);
    const sanitizedArch = sanitizeArchivesForPrivacy(archives, protectedIds);
    return { exportData: sanitizedTree, exportArchives: sanitizedArch };
  };

  const handleDownloadGedcom = () => {
    const { gedcom, report } = serializeGedcomWithReport(data, { hideLiving: hideLivingOnExport });
    const blob = new Blob([gedcom], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `genealogor_export_${new Date().toISOString().split('T')[0]}.ged`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setStatusMessage(`GEDCOM exporté avec succès (${report.totalIndividuals} individus, ${report.maskedLivingCount} vivants masqués).`);
  };

  const handleDownloadEncryptedBackup = async () => {
    setExportError(null);
    const pass = exportPassphrase.trim();
    const confirm = confirmExportPassphrase.trim();

    const quality = evaluatePassphraseQuality(pass);
    if (!quality.isAcceptable) {
      setExportError(quality.feedback || 'Phrase secrète trop faible ou non sécurisée.');
      return;
    }
    if (pass !== confirm) {
      setExportError('La confirmation ne correspond pas à la phrase secrète saisie.');
      return;
    }

    try {
      const { exportData, exportArchives } = getEffectiveBackupData();
      const backupJson = await createFullBackup(exportData, exportArchives, accessList, pass);
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `genealogor_sauvegarde_chiffree_${new Date().toISOString().split('T')[0]}.chiffre.genealogor.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportPassphrase('');
      setConfirmExportPassphrase('');
      const privacyNotice = applyPrivacyOnBackup ? ' (avec confidentialité vivants appliquée)' : '';
      setStatusMessage(`Sauvegarde chiffrée de bout en bout (AES-GCM 256 bits + SHA-256)${privacyNotice} téléchargée.`);
    } catch (e: any) {
      setExportError('Erreur de chiffrement : ' + (e?.message || 'échec technique.'));
    }
  };

  const handleDownloadPlainBackup = async () => {
    setExportError(null);
    try {
      const { exportData, exportArchives } = getEffectiveBackupData();
      const backupJson = await createFullBackup(exportData, exportArchives, accessList, undefined);
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `genealogor_sauvegarde_standard_${new Date().toISOString().split('T')[0]}.genealogor.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const privacyNotice = applyPrivacyOnBackup ? ' (avec confidentialité vivants appliquée)' : '';
      setStatusMessage(`Sauvegarde standard (JSON clair avec contrôle d'intégrité SHA-256)${privacyNotice} téléchargée.`);
    } catch (e: any) {
      setExportError('Erreur d\'export : ' + (e?.message || 'échec technique.'));
    }
  };

  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        setPendingBackupContent(content);
        setRestorePassphrase('');
        const preview = await previewBackup(content);
        setBackupPreview(preview);
      }
    };
    reader.readAsText(file);
  };

  const handleDecryptAndPreview = async () => {
    if (!pendingBackupContent) return;
    const preview = await previewBackup(pendingBackupContent, restorePassphrase);
    setBackupPreview(preview);
  };

  const handleConfirmRestore = async () => {
    if (!pendingBackupContent) return;
    const res = await restoreBackup(pendingBackupContent, data, archives, accessList, restorePassphrase);
    if (res.success && res.data) {
      onRestoreBackup(res.data);
      setBackupPreview(null);
      setPendingBackupContent(null);
      setRestorePassphrase('');
      setStatusMessage('Arbre et archives restaurés avec succès.');
      onClose();
    } else {
      alert(`Erreur de restauration : ${res.error}`);
    }
  };

  const handleUndoRestore = () => {
    const safety = restorePreBackupSafety();
    if (safety) {
      onRestoreBackup(safety);
      setStatusMessage('Restauration annulée : arbre précédent restauré.');
    } else {
      alert('Aucune sauvegarde préalable disponible.');
    }
  };

  const handleGedcomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        try {
          const parsed = parseGedcom(content);
          if (Object.keys(parsed.individuals).length > 0) {
            onLoadGedcom(parsed);
            setStatusMessage(`GEDCOM importé avec succès (${Object.keys(parsed.individuals).length} individus).`);
            onClose();
          } else {
            alert('Le fichier GEDCOM ne contient aucun individu reconnu.');
          }
        } catch (err) {
          alert('Erreur lors de la lecture du fichier GEDCOM.');
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#FBF9F5] border border-stone-300 shadow-2xl rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200/80 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-900" />
            <h2 className="font-serif text-lg font-bold text-stone-900">
              Sauvegarde, Restauration & GEDCOM
            </h2>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Modal content */}
        {backupPreview ? (
          /* Prévisualisation de sauvegarde avant restauration */
          <div className="p-4 bg-white border border-stone-200 rounded-xl space-y-4 shadow-xs">
            <h3 className="font-serif text-sm font-bold text-stone-900 flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-800" />
              <span>Vérification & Prévisualisation de la Sauvegarde</span>
            </h3>

            {backupPreview.isEncrypted && !backupPreview.isValid ? (
              <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-3 text-xs">
                <div className="flex items-center gap-2 text-amber-900 font-bold">
                  <ShieldCheck className="w-4 h-4 text-amber-800" />
                  <span>Sauvegarde chiffrée AES-GCM 256 bits</span>
                </div>
                <p className="text-stone-600">
                  Cette archive est verrouillée par une phrase secrète. Veuillez saisir le mot de passe pour la déverrouiller et vérifier son intégrité.
                </p>
                <div className="space-y-2">
                  <input
                    type="password"
                    placeholder="Phrase secrète de la sauvegarde..."
                    value={restorePassphrase}
                    onChange={e => setRestorePassphrase(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  {backupPreview.error && backupPreview.error !== 'Cette sauvegarde est protégée par chiffrement AES-GCM. Veuillez saisir la phrase secrète.' && (
                    <p className="text-rose-600 font-medium">{backupPreview.error}</p>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => { setBackupPreview(null); setPendingBackupContent(null); }}
                      className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-lg"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleDecryptAndPreview}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shadow-sm"
                    >
                      Déchiffrer & Contrôler
                    </button>
                  </div>
                </div>
              </div>
            ) : backupPreview.isValid && backupPreview.manifest ? (
              <div className="space-y-3 text-xs">
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 font-mono text-[11px] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Empreinte SHA-256 vérifiée et intègre.</span>
                  </div>
                  {backupPreview.isEncrypted && (
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                      Chiffré AES-GCM
                    </span>
                  )}
                </div>

                <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-stone-800">
                    <span className="flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Schéma strict et intégrité relationnelle validés</span>
                    </span>
                    <span className="text-stone-500 font-normal">
                      {backupPreview.validationSummary?.verifiedRelationsCount || 0} liens vérifiés
                    </span>
                  </div>
                  {backupPreview.validationSummary && backupPreview.validationSummary.repairedCrossReferencesCount > 0 && (
                    <div className="text-[10px] text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200/60">
                      {backupPreview.validationSummary.repairedCrossReferencesCount} lien(s) réciproque(s) normalisé(s) automatiquement.
                    </div>
                  )}
                  {backupPreview.validationWarnings && backupPreview.validationWarnings.length > 0 && (
                    <div className="text-[10px] text-stone-600 bg-stone-100 p-1.5 rounded border border-stone-200 space-y-0.5">
                      <span className="font-semibold text-stone-700 block">Ajustements non-bloquants :</span>
                      {backupPreview.validationWarnings.slice(0, 3).map((w, idx) => (
                        <div key={idx} className="truncate">• {w}</div>
                      ))}
                      {backupPreview.validationWarnings.length > 3 && (
                        <div className="text-stone-400 italic">... et {backupPreview.validationWarnings.length - 3} autre(s)</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-stone-700">
                  <div className="p-2 bg-stone-50 rounded">
                    <span className="text-stone-400 block text-[10px]">Individus</span>
                    <span className="font-bold font-mono">{backupPreview.manifest.stats.individualsCount}</span>
                  </div>
                  <div className="p-2 bg-stone-50 rounded">
                    <span className="text-stone-400 block text-[10px]">Familles</span>
                    <span className="font-bold font-mono">{backupPreview.manifest.stats.familiesCount}</span>
                  </div>
                  <div className="p-2 bg-stone-50 rounded">
                    <span className="text-stone-400 block text-[10px]">Archives numérisées</span>
                    <span className="font-bold font-mono">{backupPreview.manifest.stats.archivesCount}</span>
                  </div>
                  <div className="p-2 bg-stone-50 rounded">
                    <span className="text-stone-400 block text-[10px]">Règles de branches</span>
                    <span className="font-bold font-mono">{backupPreview.manifest.stats.accessRulesCount}</span>
                  </div>
                </div>

                <p className="text-[11px] text-stone-500 italic">
                  Une copie de secours de votre arbre actuel sera automatiquement enregistrée pour vous permettre d'annuler si besoin.
                </p>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                  <button
                    onClick={() => { setBackupPreview(null); setPendingBackupContent(null); }}
                    className="px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100 rounded-lg"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleConfirmRestore}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shadow-sm"
                  >
                    Confirmer la restauration
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-2">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <span>Sauvegarde non valide</span>
                </div>
                <p>{backupPreview.error}</p>
                <button
                  onClick={() => { setBackupPreview(null); setPendingBackupContent(null); }}
                  className="px-3 py-1 text-xs bg-white text-rose-900 border border-rose-300 rounded"
                >
                  Fermer
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* Section 1 : Sauvegardes Complètes (Chiffrée vs Standard) */}
            <div className="p-4 bg-white border border-stone-200 rounded-xl space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-amber-800" />
                  <h3 className="text-xs font-bold text-stone-900">Sauvegarde Complète de la Base Généalogique</h3>
                </div>
                <div className="flex items-center p-0.5 bg-stone-100 rounded-lg border border-stone-200 text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => { setExportMode('encrypted'); setExportError(null); }}
                    className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                      exportMode === 'encrypted'
                        ? 'bg-white text-amber-900 font-bold shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <Lock className="w-3 h-3 text-emerald-700" />
                    <span>Chiffrée (Recommandé)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setExportMode('plain'); setExportError(null); }}
                    className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                      exportMode === 'plain'
                        ? 'bg-white text-stone-900 font-bold shadow-xs'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    <span>Standard (Non chiffrée)</span>
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-stone-700 bg-stone-50 p-2.5 rounded-lg border border-stone-200/80">
                <input
                  type="checkbox"
                  checked={applyPrivacyOnBackup}
                  onChange={e => setApplyPrivacyOnBackup(e.target.checked)}
                  className="rounded text-amber-800 focus:ring-amber-700 h-3.5 w-3.5"
                />
                <span className="font-medium">
                  Appliquer la confidentialité stricte (masquer individus vivants & purger actes contemporains)
                </span>
              </label>

              {exportMode === 'encrypted' ? (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200/90 rounded-xl space-y-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                      <ShieldCheck className="w-4 h-4 text-emerald-700" />
                      <span>Chiffrement Authentifié Matériel (AES-256-GCM + PBKDF2)</span>
                    </div>
                    <p className="text-[11px] text-emerald-900 leading-relaxed">
                      L'intégralité de l'arbre, des individus, des actes numérisés et des photographies est chiffrée avec un sel et un vecteur d'initialisation uniques. Seul le titulaire de la phrase secrète pourra déchiffrer ce fichier.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-stone-700 uppercase tracking-wider block">
                        Phrase secrète (8 car. min)
                      </label>
                      <div className="relative">
                        <input
                          type={showPassphraseText ? 'text' : 'password'}
                          placeholder="Phrase secrète..."
                          value={exportPassphrase}
                          onChange={e => setExportPassphrase(e.target.value)}
                          className="w-full pl-2.5 pr-8 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassphraseText(!showPassphraseText)}
                          className="absolute right-2 top-2 text-stone-400 hover:text-stone-700"
                        >
                          {showPassphraseText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-stone-700 uppercase tracking-wider block">
                        Confirmer la phrase secrète
                      </label>
                      <input
                        type={showPassphraseText ? 'text' : 'password'}
                        placeholder="Répéter la phrase..."
                        value={confirmExportPassphrase}
                        onChange={e => setConfirmExportPassphrase(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                      />
                    </div>
                  </div>

                  {exportPassphrase.length > 0 && (() => {
                    const q = evaluatePassphraseQuality(exportPassphrase);
                    const colorClass = q.level === 'strong' ? 'text-emerald-700' : q.level === 'medium' ? 'text-amber-700' : 'text-rose-700';
                    const barBg = q.level === 'strong' ? 'bg-emerald-600' : q.level === 'medium' ? 'bg-amber-500' : 'bg-rose-500';
                    const barWidth = q.score === 4 ? '100%' : q.score === 3 ? '75%' : q.score === 2 ? '50%' : '25%';
                    return (
                      <div className="space-y-1 text-[11px] bg-stone-50 p-2 rounded-lg border border-stone-200">
                        <div className="flex items-center justify-between">
                          <span className="text-stone-600 font-medium">Sécurité de la phrase :</span>
                          <span className={`font-bold ${colorClass}`}>{q.label}</span>
                        </div>
                        <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                          <div className={`h-full ${barBg} transition-all duration-300`} style={{ width: barWidth }} />
                        </div>
                        {q.feedback && <p className="text-[10px] text-stone-600 italic">{q.feedback}</p>}
                      </div>
                    );
                  })()}

                  {exportError && (
                    <div className="p-2 bg-rose-100 border border-rose-300 rounded-lg text-rose-900 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                      <span>{exportError}</span>
                    </div>
                  )}

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleDownloadEncryptedBackup}
                      className="w-full py-2 px-3 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Télécharger la sauvegarde chiffrée (.chiffre.genealogor.json)</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl space-y-2.5">
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-amber-950 block">
                        Sauvegarde Standard Non Chiffrée (Texte Clair)
                      </span>
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        Cette archive stocke les données généalogiques et actes en JSON clair, sans mot de passe.
                        L'empreinte <strong>SHA-256</strong> intégrée garantit l'intégrité technique contre les corruptions de fichier, mais <strong>n'assure aucune confidentialité</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleDownloadPlainBackup}
                      className="w-full py-2 px-3 text-xs font-semibold text-stone-900 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg shadow-2xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-800" />
                      <span>Télécharger la sauvegarde standard (.genealogor.json)</span>
                    </button>
                  </div>
                </div>
              )}

              {userRole === 'admin' && (
                <div className="pt-1 border-t border-stone-100 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => fileInputBackupRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors border border-stone-300 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-stone-600" />
                    <span>Restaurer une sauvegarde (chiffrée ou standard)</span>
                  </button>
                  <input
                    ref={fileInputBackupRef}
                    type="file"
                    accept=".json,.genealogor.json"
                    onChange={handleBackupFileSelect}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* Section 2 : GEDCOM Standard 5.5.1 */}
            <div className="p-4 bg-white border border-stone-200 rounded-xl space-y-2.5 shadow-2xs">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-800" />
                <h3 className="text-xs font-bold text-stone-900">Format Standard International GEDCOM (.ged)</h3>
              </div>
              
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-stone-600 bg-stone-50 p-2 rounded-lg border border-stone-200/60">
                <input
                  type="checkbox"
                  checked={hideLivingOnExport}
                  onChange={e => setHideLivingOnExport(e.target.checked)}
                  className="rounded text-amber-800 focus:ring-amber-700 h-3.5 w-3.5"
                />
                <span>Masquer les personnes vivantes dans le fichier exporté (RGPD / Confidentialité)</span>
              </label>

              <div className={userRole === 'admin' ? "grid grid-cols-2 gap-2 pt-1" : "pt-1"}>
                <button
                  onClick={handleDownloadGedcom}
                  className="w-full py-2 px-3 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors border border-stone-200 cursor-pointer"
                >
                  Exporter en GEDCOM {userRole !== 'admin' && '(Sauvegarde de consultation)'}
                </button>
                {userRole === 'admin' && (
                  <>
                    <button
                      onClick={() => fileInputGedRef.current?.click()}
                      className="py-2 px-3 text-xs font-semibold text-stone-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors border border-stone-200 cursor-pointer"
                    >
                      Importer un fichier .ged
                    </button>
                    <input
                      ref={fileInputGedRef}
                      type="file"
                      accept=".ged,.gedcom"
                      onChange={handleGedcomUpload}
                      className="hidden"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Section 3 : Réinitialisation de l'Arbre */}
            {userRole === 'admin' ? (
              <div className="pt-2 border-t border-stone-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-serif font-bold text-stone-900 uppercase tracking-wider">
                    Réinitialisation de l'Arbre
                  </span>
                </div>

                {/* Panneau de réinitialisation de l'arbre */}
                {showClearConfirm ? (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3 text-xs text-rose-950 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 font-bold text-rose-900">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>Confirmer la réinitialisation de l'arbre en cours</span>
                    </div>
                    <p className="text-stone-700 leading-relaxed text-[11px]">
                      Cette action va <strong>effacer les individus et les archives</strong> de l'arbre actuel. L'espace redeviendra un <strong>arbre vierge</strong> prêt pour votre propre généalogie ou un nouvel import GEDCOM.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (onClearTree) {
                            onClearTree();
                            setShowClearConfirm(false);
                            onClose();
                          }
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-lg text-xs shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Oui, réinitialiser l'arbre</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowClearConfirm(false)}
                        className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-300 font-medium rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="text-xs font-semibold text-stone-800 block">
                        Vider l'arbre en cours pour repartir à zéro
                      </span>
                      <span className="text-[11px] text-stone-500 block">
                        Supprime les personnes et actes de l'arbre actif pour recommencer sur une base vierge.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowClearConfirm(true)}
                      className="shrink-0 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Vider l'arbre</span>
                    </button>
                  </div>
                )}

                {/* Raccourcis complémentaires */}
                <div className="flex items-center justify-start text-xs text-stone-500 pt-1">
                  <button
                    type="button"
                    onClick={handleUndoRestore}
                    className="text-stone-600 hover:text-amber-900 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Annuler dernière restauration</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-stone-200/80">
                <div className="p-3 bg-sky-50 border border-sky-200/80 rounded-xl text-xs text-sky-950 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-sky-700 shrink-0" />
                  <span>
                    <strong>Profil Lecteur :</strong> La réinitialisation et la modification globale de l'arbre sont réservées au profil créateur.
                  </span>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
