import { ArchiveDocument } from '../types/genealogy';

const ARCHIVES_STORAGE_KEY = 'genealogor_archives_v1';

export function getStoredArchives(): ArchiveDocument[] {
  try {
    const hasStorage = typeof localStorage !== 'undefined';
    const raw = hasStorage ? localStorage.getItem(ARCHIVES_STORAGE_KEY) : null;
    if (raw) {
      const parsed: ArchiveDocument[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Erreur lecture archives', e);
  }
  return [];
}

export function saveStoredArchives(archives: ArchiveDocument[]): void {
  try {
    localStorage.setItem(ARCHIVES_STORAGE_KEY, JSON.stringify(archives));
  } catch (e) {
    console.error('Erreur sauvegarde archives', e);
  }
}

export function clearStoredArchives(): void {
  try {
    localStorage.setItem(ARCHIVES_STORAGE_KEY, JSON.stringify([]));
  } catch (e) {
    console.error('Erreur effacement archives', e);
  }
}

export function getDefaultArchives(): ArchiveDocument[] {
  return [];
}

