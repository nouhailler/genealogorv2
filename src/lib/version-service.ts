/**
 * Service de gestion des versions, vérifications et mises à jour automatiques en arrière-plan.
 */

export interface VersionInfo {
  version: string;
  releaseDate: string;
  lastCheckedTime?: number;
  isUpdateAvailable: boolean;
  status: 'idle' | 'checking' | 'up_to_date' | 'update_available' | 'updating' | 'error';
  errorMessage?: string;
}

export const APP_METADATA = {
  version: '2.5.0',
  releaseDate: '20 octobre 2026',
  channel: 'Stable Production',
  buildHash: 'rel-20261020-f4a8',
};

const STORAGE_KEYS = {
  LAST_CHECK: 'genealogor_last_update_check',
  AUTO_UPDATE_INTERVAL_MIN: 'genealogor_auto_update_interval',
  AUTO_UPDATE_ENABLED: 'genealogor_auto_update_enabled',
};

class VersionService {
  private lastChecked: number = 0;
  private isChecking: boolean = false;
  private listeners: Set<(info: VersionInfo) => void> = new Set();
  private intervalTimer: any = null;
  private currentStatus: VersionInfo['status'] = 'idle';
  private updateAvailable: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEYS.LAST_CHECK);
      if (stored) {
        this.lastChecked = parseInt(stored, 10) || 0;
      }
      this.initBackgroundWorker();
    }
  }

  public getVersionInfo(): VersionInfo {
    return {
      version: APP_METADATA.version,
      releaseDate: APP_METADATA.releaseDate,
      lastCheckedTime: this.lastChecked || undefined,
      isUpdateAvailable: this.updateAvailable,
      status: this.currentStatus,
    };
  }

  public subscribe(cb: (info: VersionInfo) => void): () => void {
    this.listeners.add(cb);
    cb(this.getVersionInfo());
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    const info = this.getVersionInfo();
    for (const listener of this.listeners) {
      try {
        listener(info);
      } catch (e) {}
    }
  }

  /**
   * Vérifie la disponibilité d'une nouvelle version auprès du serveur ou du cache.
   */
  public async checkForUpdates(isAuto: boolean = false): Promise<VersionInfo> {
    if (this.isChecking) return this.getVersionInfo();
    this.isChecking = true;
    this.currentStatus = 'checking';
    this.notify();

    try {
      // Requête avec cache-busting pour éviter le cache HTTP
      const res = await fetch(`/api/system/version?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });

      this.lastChecked = Date.now();
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEYS.LAST_CHECK, String(this.lastChecked));
      }

      if (res.ok) {
        const data = await res.json();
        // Compare version
        if (data.version && data.version !== APP_METADATA.version) {
          this.updateAvailable = true;
          this.currentStatus = 'update_available';
        } else {
          this.updateAvailable = false;
          this.currentStatus = 'up_to_date';
        }
      } else {
        // En cas de mode hors ligne ou hébergement statique pur, vérifier via Service Worker
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            this.currentStatus = 'up_to_date';
          }
        } else {
          this.currentStatus = 'up_to_date';
        }
      }
    } catch (e: any) {
      // Réseau déconnecté ou mode local
      this.lastChecked = Date.now();
      this.currentStatus = 'up_to_date';
    } finally {
      this.isChecking = false;
      this.notify();
    }

    return this.getVersionInfo();
  }

  /**
   * Force le rechargement complet et le vidage des caches d'application sans toucher aux données locales.
   */
  public async forceUpdate(): Promise<void> {
    this.currentStatus = 'updating';
    this.notify();

    try {
      // 1. Vider les caches du Service Worker (CacheStorage)
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }

      // 2. Mettre à jour et réenregistrer les Service Workers
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.update();
        }
      }

      // 3. Recharger la page en ignorant le cache navigateur
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }, 500);
    } catch (e) {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }
  }

  /**
   * Démarre la vérification automatique périodique en arrière-plan.
   */
  private initBackgroundWorker() {
    if (typeof window === 'undefined') return;

    const intervalMinutes = this.getAutoUpdateInterval();
    const intervalMs = Math.max(intervalMinutes, 5) * 60 * 1000;

    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = setInterval(() => {
      if (this.isAutoUpdateEnabled()) {
        this.checkForUpdates(true);
      }
    }, intervalMs);

    // Vérifier également au retour d'inactivité (quand l'onglet redevient visible)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.isAutoUpdateEnabled()) {
        const elapsed = Date.now() - this.lastChecked;
        if (elapsed > 10 * 60 * 1000) { // Plus de 10 min depuis la dernière vérif
          this.checkForUpdates(true);
        }
      }
    });

    // Première vérification discrète 5 secondes après le démarrage
    setTimeout(() => {
      if (this.isAutoUpdateEnabled()) {
        this.checkForUpdates(true);
      }
    }, 5000);
  }

  public isAutoUpdateEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    const val = localStorage.getItem(STORAGE_KEYS.AUTO_UPDATE_ENABLED);
    return val === null ? true : val === 'true';
  }

  public setAutoUpdateEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.AUTO_UPDATE_ENABLED, String(enabled));
    this.initBackgroundWorker();
  }

  public getAutoUpdateInterval(): number {
    if (typeof window === 'undefined') return 30; // 30 minutes par défaut
    const val = localStorage.getItem(STORAGE_KEYS.AUTO_UPDATE_INTERVAL_MIN);
    return val ? parseInt(val, 10) || 30 : 30;
  }

  public setAutoUpdateInterval(minutes: number): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.AUTO_UPDATE_INTERVAL_MIN, String(minutes));
    this.initBackgroundWorker();
  }
}

export const versionService = new VersionService();
