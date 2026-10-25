import { PREFIX } from './api.js';

export const CANARY_KEY = `${PREFIX}canary`;
const INCIDENTS_KEY = `${PREFIX}incidents`;
const BLOCKED_KEY = `${PREFIX}blockedUntil`;
const REASON_KEY = `${PREFIX}blockReason`;
const topics = ['html', 'javascript', 'api'];
let incidents = readIncidents();
let blockedUntil = readBlockedUntil();
let restrictionReason = readRestrictionReason();
let refreshTimes = [];
let timer = null;

function readIncidents() {
  try {
    const value = JSON.parse(localStorage.getItem(INCIDENTS_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && typeof item.time === 'string' && typeof item.type === 'string' && typeof item.reason === 'string').slice(0, 30);
  } catch {
    return [];
  }
}

function readBlockedUntil() {
  try {
    const value = Number(localStorage.getItem(BLOCKED_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function readRestrictionReason() {
  try {
    return localStorage.getItem(REASON_KEY) || 'Подозрительная активность';
  } catch {
    return 'Подозрительная активность';
  }
}

function renderIncidents() {
  const list = document.querySelector('#incident-list');
  list.replaceChildren();
  for (const incident of incidents) {
    const item = document.createElement('li');
    item.textContent = `${incident.time}: ${incident.type} — ${incident.reason}`;
    list.append(item);
  }
  document.querySelector('#incidents-empty').hidden = incidents.length > 0;
  document.querySelector('#incident-count').textContent = String(incidents.length);
}

function updateRestriction() {
  if (blockedUntil && blockedUntil <= Date.now()) {
    blockedUntil = 0;
    restrictionReason = '';
    clearInterval(timer);
    timer = null;
    try {
      localStorage.removeItem(BLOCKED_KEY);
      localStorage.removeItem(REASON_KEY);
    } catch {}
  }
  const remaining = Math.max(0, blockedUntil - Date.now());
  const active = remaining > 0;
  document.querySelector('#security-status').textContent = active ? 'Действия временно ограничены' : 'Ограничений нет';
  const detail = document.querySelector('#restriction-detail');
  detail.hidden = !active;
  detail.textContent = active ? `Причина: ${restrictionReason}. Осталось: ${Math.ceil(remaining / 1000)} сек.` : '';
  document.querySelector('#refresh-button').disabled = active;
  document.querySelector('#submit-button').disabled = active || document.querySelector('#application-form').getAttribute('aria-busy') === 'true';
}

function startTimer() {
  clearInterval(timer);
  updateRestriction();
  timer = blockedUntil ? setInterval(updateRestriction, 1000) : null;
}

export function reportIncident(type, reason) {
  incidents.unshift({ time: new Date().toISOString(), type, reason });
  incidents = incidents.slice(0, 30);
  try {
    localStorage.setItem(INCIDENTS_KEY, JSON.stringify(incidents));
  } catch {}
  renderIncidents();
  if (isRestricted()) return;
  blockedUntil = Date.now() + 30000;
  restrictionReason = reason;
  try {
    localStorage.setItem(BLOCKED_KEY, String(blockedUntil));
    localStorage.setItem(REASON_KEY, reason);
  } catch {}
  startTimer();
}

export function checkActivity(action, details = {}) {
  if (action === 'refresh') {
    const now = Date.now();
    refreshTimes = refreshTimes.filter(time => now - time <= 5000);
    refreshTimes.push(now);
    if (refreshTimes.length >= 6) {
      refreshTimes = [];
      reportIncident('T1', 'Шестое обновление списка за 5 секунд');
    }
  }
  if (action === 'submit') {
    if (details.supportCode) reportIncident('T2', 'Заполнено скрытое поле supportCode');
    if (details.topic && !topics.includes(details.topic)) reportIncident('T4', 'Получено направление вне списка');
  }
  if (action === 'decoy') reportIncident('T3', 'Вызвана скрытая кнопка staff-export');
  if (action !== 'startup') return;

  let canary;
  try {
    canary = JSON.parse(localStorage.getItem(CANARY_KEY));
  } catch {}
  if (canary?.role === 'admin') {
    try {
      localStorage.setItem(CANARY_KEY, JSON.stringify({ role: 'visitor' }));
    } catch {}
    reportIncident('T5', 'Маркер canary изменён на admin');
  }

  const url = new URL(window.location.href);
  if (url.searchParams.getAll('staff').includes('1')) {
    url.searchParams.delete('staff');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    reportIncident('T6', 'В адресе обнаружен параметр staff=1');
  }
}

export function isRestricted() {
  if (blockedUntil && blockedUntil <= Date.now()) updateRestriction();
  return blockedUntil > Date.now();
}

export function initializeSecurity() {
  try {
    if (localStorage.getItem(CANARY_KEY) === null) {
      localStorage.setItem(CANARY_KEY, JSON.stringify({ role: 'visitor' }));
    }
  } catch {}
  renderIncidents();
  checkActivity('startup');
  startTimer();
}

export function resetSecurity() {
  incidents = [];
  refreshTimes = [];
  blockedUntil = 0;
  restrictionReason = '';
  clearInterval(timer);
  timer = null;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX) && key !== `${PREFIX}applications`) localStorage.removeItem(key);
    }
    localStorage.setItem(CANARY_KEY, JSON.stringify({ role: 'visitor' }));
  } catch {}
  renderIncidents();
  updateRestriction();
}
