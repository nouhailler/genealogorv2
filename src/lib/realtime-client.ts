import { PeerPresence } from '../types/genealogy';

export type SyncCallback = (data: any) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private channel: BroadcastChannel | null = null;
  private roomId: string = '';
  private clientId: string = '';
  private userName: string = 'Visiteur';
  private branch: string = 'all';
  private listeners: Map<string, Set<SyncCallback>> = new Map();
  private isConnected: boolean = false;
  private reconnectTimer: any = null;

  public get connected(): boolean {
    return this.isConnected;
  }

  constructor() {
    this.clientId = 'client-' + Math.random().toString(36).substring(2, 9);
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('genealogor_channel');
      this.channel.onmessage = (event) => {
        this.dispatch(event.data.type, event.data);
      };
    }
  }

  private roomToken: string = '';
  private pendingAcks: Map<string, { resolve: (val: { success: boolean; error?: string; persisted?: boolean; durable?: boolean }) => void; timer: any }> = new Map();

  public init(roomId: string, userName: string = 'Membre de la famille', branch: string = 'all', roomToken: string = '') {
    this.roomId = roomId;
    this.userName = userName;
    this.branch = branch;
    this.roomToken = roomToken;

    this.connectWs();
  }

  private connectWs() {
    if (typeof window === 'undefined') return;

    try {
      const customWsUrl = (import.meta.env as any)?.VITE_WS_URL;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = customWsUrl || `${protocol}//${window.location.host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.ws?.send(JSON.stringify({
          type: 'join',
          roomId: this.roomId,
          clientId: this.clientId,
          userName: this.userName,
          branch: this.branch,
          roomToken: this.roomToken,
        }));
        this.dispatch('connection:change', { connected: true, isWs: true });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Traitement des accusés de réception du serveur
          if (msg.type === 'action:ack' && msg.opId) {
            const handler = this.pendingAcks.get(msg.opId);
            if (handler) {
              clearTimeout(handler.timer);
              this.pendingAcks.delete(msg.opId);
              if (msg.status === 'success') {
                handler.resolve({ 
                  success: true, 
                  persisted: Boolean(msg.persisted), 
                  durable: Boolean(msg.durable) 
                });
              } else {
                handler.resolve({ 
                  success: false, 
                  error: msg.message || msg.code || 'Action rejetée par le serveur' 
                });
              }
            }
          }

          this.dispatch(msg.type, msg);
        } catch (e) {
          console.error('WS parse error', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        // Rejeter les ACK en attente si la connexion tombe
        for (const [opId, handler] of this.pendingAcks.entries()) {
          clearTimeout(handler.timer);
          handler.resolve({ success: false, error: 'Connexion WebSocket interrompue' });
        }
        this.pendingAcks.clear();

        this.dispatch('connection:change', { connected: false, isWs: true });
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error, fallback to BroadcastChannel', err);
        this.ws?.close();
      };
    } catch (e) {
      console.warn('Could not establish WebSocket, running in local channel mode', e);
      this.dispatch('connection:change', { connected: true, isWs: false });
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.roomId && !this.isConnected) {
        this.connectWs();
      }
    }, 4000);
  }

  /**
   * Envoie une action et attend la validation et l'accusé de réception (ACK) du serveur.
   */
  public sendActionWithAck(
    action: string, 
    payload: any, 
    opId?: string, 
    timeoutMs = 6000
  ): Promise<{ success: boolean; error?: string }> {
    const stableId = opId || ('op-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7));
    const message = {
      type: 'sync:action',
      id: stableId,
      opId: stableId,
      roomId: this.roomId,
      clientId: this.clientId,
      action,
      payload,
      timestamp: Date.now(),
    };

    // Diffusion locale immédiate aux onglets du même navigateur
    if (this.channel) {
      this.channel.postMessage(message);
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ success: false, error: 'Serveur WebSocket hors ligne' });
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingAcks.delete(stableId);
        resolve({ success: false, error: 'Délai dépassé sans accusé de réception (timeout ACK)' });
      }, timeoutMs);

      this.pendingAcks.set(stableId, { resolve, timer });

      try {
        this.ws!.send(JSON.stringify(message));
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingAcks.delete(stableId);
        resolve({ success: false, error: err?.message || 'Échec de transmission socket' });
      }
    });
  }

  public sendAction(action: string, payload: any) {
    return this.sendActionWithAck(action, payload);
  }

  public sendPresence(activeView?: string, activePersonId?: string) {
    const ping = {
      type: 'presence:ping',
      roomId: this.roomId,
      clientId: this.clientId,
      userName: this.userName,
      activeView,
      activePersonId,
      timestamp: Date.now(),
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(ping));
    }
    if (this.channel) {
      this.channel.postMessage({ ...ping, type: 'presence:update' });
    }
  }

  public on(event: string, callback: SyncCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private dispatch(event: string, data: any) {
    const cbs = this.listeners.get(event);
    if (cbs) {
      cbs.forEach(cb => cb(data));
    }
  }

  public getClientId() {
    return this.clientId;
  }

  public isWsConnected() {
    return this.isConnected;
  }
}

export const realtimeClient = new RealtimeClient();

/**
 * Vrai si la réponse provient bien de l'API du serveur relais (JSON). Sur un hébergement statique
 * (Cloudflare Pages/Workers), /api/* retombe sur index.html (200, text/html).
 */
export function isJsonResponse(res: Response): boolean {
  return (res.headers.get('content-type') || '').includes('application/json');
}
