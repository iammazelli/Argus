// ── Argus IoT Platform — API client & utilities ──

// Ajuste para o IP/domínio do Servidor A (via proxy Nginx em /api)
const API_BASE = '/api';

const api = {
  async get(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  }
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

function timeSince(iso) {
  if (!iso) return 'nunca';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s atrás`;
  if (s < 3600) return `${Math.floor(s/60)}min atrás`;
  return `${Math.floor(s/3600)}h atrás`;
}

function getDeviceIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

function showToast(msg, type = 'info') {
  const colors = { info: '#3d8ef0', success: '#22c55e', error: '#ef4444' };
  const t = document.createElement('div');
  t.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${colors[type] || colors.info};color:#fff;
    padding:12px 20px;border-radius:10px;font-size:14px;
    box-shadow:0 4px 20px rgba(0,0,0,.3);
    animation:fadeUp .3s ease;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}