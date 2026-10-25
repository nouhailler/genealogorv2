import React, { useState } from 'react';
import { Bell, ChevronDown, ChevronUp, CheckCheck, ArrowRight, UserPlus, UserPen, UserX, FileText, Camera, Users, Layers } from 'lucide-react';
import { ArchiveDocument, GenealogyData } from '../types/genealogy';
import { ChangeEvent, ChangeKind, describeChange, isChangeNavigable } from '../lib/change-log';

interface ChangeAlertBannerProps {
  /** Alertes non lues, les plus récentes en tête */
  unread: ChangeEvent[];
  data: GenealogyData;
  archives: ArchiveDocument[];
  onOpen: (change: ChangeEvent) => void;
  onMarkAllRead: () => void;
}

const ICONS: Record<ChangeKind, React.ElementType> = {
  'person:add': UserPlus,
  'person:edit': UserPen,
  'person:delete': UserX,
  'family:edit': Users,
  'archive:add': FileText,
  'archive:edit': FileText,
  'archive:delete': FileText,
  'photo:tag': Camera,
  bulk: Layers,
};

function timeAgo(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return 'à l\'instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * Bandeau d'alertes : signale les modifications de l'arbre non encore vues
 * et permet d'aller directement à l'élément ajouté ou modifié.
 */
export const ChangeAlertBanner: React.FC<ChangeAlertBannerProps> = ({ unread, data, archives, onOpen, onMarkAllRead }) => {
  const [expanded, setExpanded] = useState(false);
  if (unread.length === 0) return null;

  const renderItem = (change: ChangeEvent, compact = false) => {
    const Icon = ICONS[change.kind];
    const navigable = isChangeNavigable(change, data, archives);
    const content = (
      <>
        <Icon className="w-3.5 h-3.5 shrink-0 text-amber-800 dark:text-amber-400" />
        <span className={`min-w-0 ${compact ? 'truncate' : ''}`}>{describeChange(change, data)}</span>
        <span className="shrink-0 font-mono text-[10px] text-amber-700/80 dark:text-amber-400/70">{timeAgo(change.at)}</span>
        {navigable && <ArrowRight className="w-3 h-3 shrink-0 text-amber-800 dark:text-amber-400" />}
      </>
    );
    return navigable ? (
      <button
        key={change.id}
        type="button"
        onClick={() => onOpen(change)}
        className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-amber-100/80 dark:hover:bg-amber-900/40 cursor-pointer"
        title="Aller à l'élément"
      >
        {content}
      </button>
    ) : (
      <div key={change.id} className="w-full flex items-center gap-2 px-2 py-1.5 text-stone-600 dark:text-stone-400">
        {content}
      </div>
    );
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-300/80 dark:border-amber-800 px-4 md:px-8 py-2 text-xs text-amber-950 dark:text-amber-100"
    >
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 font-bold shrink-0">
          <Bell className="w-4 h-4 text-amber-800 dark:text-amber-400" />
          <span>{unread.length} modification{unread.length > 1 ? 's' : ''}</span>
        </span>
        <div className="flex-1 min-w-0">{!expanded && renderItem(unread[0], true)}</div>
        {unread.length > 1 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 font-semibold shrink-0 hover:underline cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{expanded ? 'Réduire' : 'Tout voir'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            onMarkAllRead();
          }}
          className="flex items-center gap-1 shrink-0 text-amber-800 dark:text-amber-300 hover:underline cursor-pointer"
          title="Marquer toutes les alertes comme lues"
        >
          <CheckCheck className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Tout marquer comme lu</span>
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 max-h-64 overflow-y-auto space-y-0.5 border-t border-amber-200/80 dark:border-amber-800 pt-1.5">
          {unread.map(change => renderItem(change))}
        </div>
      )}
    </div>
  );
};
