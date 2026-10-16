import { apiClient } from '../api/ApiClient.js';

class RealtimeClient {
  constructor() { this.attempts = 0; this.started = false; this.connected = false; }

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('erp:sessionChanged', () => this.syncSession());
    window.addEventListener('online', () => this.syncSession());
    window.addEventListener('popstate', () => this.syncSession());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.syncSession(); });
    this.syncSession();
  }

  syncSession() {
    const token = apiClient.getToken();
    if (!token) { this.disconnect(); return; }
    if (this.socket && this.token === token) return;
    this.disconnect();
    this.connect();
  }

  connect() {
    if (this.socket) return;
    const token = apiClient.getToken();
    if (!token || !navigator.onLine) return;
    const url = new URL(apiClient.getBaseUrls()[0]);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/$/,'')}/realtime`;
    url.search = '';
    const socket = new WebSocket(url);
    this.socket = socket;
    this.token = token;
    this.connectionTimeout = setTimeout(() => socket.close(),10000);
    socket.onopen = () => socket.send(JSON.stringify({ type:'authenticate', token }));
    socket.onmessage = event => {
      if (socket !== this.socket) return;
      let message;
      try { message = JSON.parse(event.data); } catch (_) { return; }
      if (message.type === 'ready') {
        clearTimeout(this.connectionTimeout);
        this.connected = true;
        this.attempts = 0;
        if (this.hasConnected) window.dispatchEvent(new CustomEvent('erp:realtime', { detail:{ topics:['resync'] } }));
        this.hasConnected = true;
      } else if (message.type === 'changed' && Array.isArray(message.topics)) {
        window.dispatchEvent(new CustomEvent('erp:realtime', { detail:{ topics:message.topics } }));
      } else if (message.type === 'schedule-holds' || message.type === 'schedule-hold-result') {
        window.dispatchEvent(new CustomEvent('erp:schedule-holds', { detail:message }));
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = async event => {
      if (socket !== this.socket) return;
      clearTimeout(this.connectionTimeout);
      this.socket = null;
      this.connected = false;
      if (!apiClient.getToken()) return;
      if (event.code === 4001) {
        try {
          if (!await apiClient.tryRefresh()) { apiClient.expireSession(); return; }
        } catch (_) { /* Retry when the backend becomes available. */ }
      }
      const delay = Math.min(30000,1000 * (2 ** Math.min(this.attempts++,5))) + Math.random()*500;
      this.retry = setTimeout(() => this.connect(),delay);
    };
  }

  disconnect() {
    clearTimeout(this.retry);
    clearTimeout(this.connectionTimeout);
    const socket = this.socket;
    this.socket = null;
    this.connected = false;
    socket?.close();
  }

  sendSelectionHold(slots, requestId) {
    if (!this.connected || this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type:'schedule-hold', slots, requestId }));
    return true;
  }
}

export const realtimeClient = new RealtimeClient();

export function subscribeRealtime(topics, callback, isActive = () => true) {
  let stopped = false, busy = false, pending = false;
  const stop = () => { stopped = true; window.removeEventListener('erp:realtime',listener); observer.disconnect(); };
  const run = async () => {
    if (stopped) return;
    if (!isActive()) { stop(); return; }
    if (busy) { pending = true; return; }
    busy = true;
    try { await callback(); } catch (error) { console.warn('Realtime update failed:',error.message); }
    finally { busy = false; if (pending) { pending = false; run(); } }
  };
  const listener = event => {
    if (event.detail?.topics?.some(topic => topic === 'resync' || topics.includes(topic))) run();
  };
  const observer = new MutationObserver(() => { if (!isActive()) stop(); });
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('erp:realtime',listener);
  queueMicrotask(run);
  return stop;
}
