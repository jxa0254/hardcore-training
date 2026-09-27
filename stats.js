// stats.js — hidden visitor-stats page. Not linked from index.html or
// admin.html; reachable only by knowing this URL. Gated with the same
// passcode as admin.html (ADMIN_PASSCODE below) - if you change one, change
// the other too, they're not shared code, just the same value.

document.getElementById('btnRefresh').addEventListener('click', () => {
    location.href = location.pathname + '?t=' + Date.now();
});

document.getElementById('btnBackToApp').addEventListener('click', () => {
    location.href = 'index.html?t=' + Date.now();
});

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

/** Best-effort, rough browser/OS guess from a user-agent string - just for
 *  readability in the list, not meant to be precise. */
function summarizeUA(ua) {
    if (!ua) return 'Unknown';
    let os = 'Unknown OS';
    if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/windows/i.test(ua)) os = 'Windows';
    else if (/mac os/i.test(ua)) os = 'Mac';
    else if (/linux/i.test(ua)) os = 'Linux';

    let browser = 'Unknown browser';
    if (/edg\//i.test(ua)) browser = 'Edge';
    else if (/chrome\//i.test(ua)) browser = 'Chrome';
    else if (/crios\//i.test(ua)) browser = 'Chrome';
    else if (/fxios\//i.test(ua)) browser = 'Firefox';
    else if (/firefox\//i.test(ua)) browser = 'Firefox';
    else if (/safari\//i.test(ua)) browser = 'Safari';

    return `${browser} · ${os}`;
}

/** Rough device-class guess from a user-agent string. */
function summarizeDevice(ua) {
    if (!ua) return 'Unknown';
    if (/ipad|tablet(?!.*mobile)/i.test(ua)) return 'Tablet';
    if (/mobi|iphone|android/i.test(ua)) return 'Phone';
    return 'Desktop';
}

function summarizeLocation(v) {
    const parts = [v.city, v.region, v.country].filter(p => p && p !== 'XX');
    return parts.length ? parts.join(', ') : (v.country || 'Unknown');
}

function summarizeRef(ref) {
    if (!ref) return 'Direct / no referrer';
    try {
        return new URL(ref).hostname;
    } catch {
        return ref.slice(0, 60);
    }
}

function setStatus(msg, isError) {
    const el = document.getElementById('statsStatus');
    el.textContent = msg;
    el.style.color = isError ? '#ff6b6b' : 'var(--muted)';
}

function renderStats(stats) {
    const days = Object.keys(stats.byDay || {}).sort().reverse();
    const today = new Date().toISOString().slice(0, 10);
    const last7 = days
        .filter(d => (new Date(today) - new Date(d)) / 86400000 < 7)
        .reduce((sum, d) => sum + stats.byDay[d], 0);

    document.getElementById('summary').innerHTML = `
        <div class="workout-row">
            <div class="info"><p class="title">${stats.total || 0}</p><p class="snippet">Total visits (all time)</p></div>
        </div>
        <div class="workout-row">
            <div class="info"><p class="title">${stats.byDay[today] || 0}</p><p class="snippet">Visits today</p></div>
        </div>
        <div class="workout-row">
            <div class="info"><p class="title">${last7}</p><p class="snippet">Visits in the last 7 days</p></div>
        </div>
    `;

    const byDayEl = document.getElementById('byDay');
    const recentDays = days.slice(0, 14);
    byDayEl.innerHTML = recentDays.length === 0
        ? '<div class="empty-list">No visits recorded yet.</div>'
        : recentDays.map(d => `
            <div class="workout-row">
                <div class="info"><p class="title" style="font-size:14px;">${d}</p></div>
                <div class="row-actions"><span class="rank-pill rank-Tough">${stats.byDay[d]}</span></div>
            </div>
        `).join('');

    const recentEl = document.getElementById('recent');
    const recent = (stats.recent || []).slice(0, 50);
    recentEl.innerHTML = recent.length === 0
        ? '<div class="empty-list">No visits recorded yet.</div>'
        : recent.map(v => `
            <div class="workout-row">
                <div class="info">
                    <p class="title" style="font-size:14px;">${escapeHtml(new Date(v.t).toLocaleString())} — ${escapeHtml(summarizeLocation(v))}</p>
                    <p class="snippet">${escapeHtml(summarizeDevice(v.ua))} · ${escapeHtml(summarizeUA(v.ua))} · from ${escapeHtml(summarizeRef(v.ref))} · ${escapeHtml(v.path || '/')}</p>
                </div>
            </div>
        `).join('');
}

async function initStats() {
    setStatus('Loading…', false);
    try {
        const stats = await fetchStats();
        renderStats(stats);
        setStatus('Loaded.', false);
    } catch (err) {
        setStatus(err.message || 'Could not load stats.', true);
    }
}

// --- Passcode gate (same value as admin.html's) ---

const ADMIN_PASSCODE = '230478';
const UNLOCK_KEY = 'hybridArena.adminUnlocked';

const lockScreen = document.getElementById('lockScreen');
const statsContent = document.getElementById('statsContent');
const pinInput = document.getElementById('pinInput');
const pinError = document.getElementById('pinError');

function unlock() {
    sessionStorage.setItem(UNLOCK_KEY, '1');
    lockScreen.hidden = true;
    statsContent.hidden = false;
    initStats();
}

document.getElementById('btnUnlock').addEventListener('click', () => {
    if (pinInput.value === ADMIN_PASSCODE) {
        pinError.style.display = 'none';
        unlock();
    } else {
        pinError.style.display = 'block';
        pinInput.value = '';
        pinInput.focus();
    }
});

pinInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnUnlock').click();
});

if (sessionStorage.getItem(UNLOCK_KEY) === '1') {
    unlock();
} else {
    pinInput.focus();
}
