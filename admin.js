// admin.js — load workouts in, edit, rank, delete. Every change here saves
// straight to workouts.json in the GitHub repo via the GitHub Contents API,
// so there's no separate "publish" step — the public picker (index.html)
// picks it up automatically once GitHub Pages rebuilds (usually under a
// minute). Writing requires a GitHub token, entered once and kept only in
// this browser's localStorage (see the token card below); reading the
// current list works without one.

const GH_OWNER = 'jxa0254';
const GH_REPO = 'hardcore-training';
const GH_PATH = 'workouts.json';
const GH_BRANCH = 'main';
const TOKEN_KEY = 'hybridArena.githubToken';

function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
}

function authHeaders() {
    const headers = { Accept: 'application/vnd.github+json' };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

function b64ToUtf8(b64) {
    return decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
}

function utf8ToB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

let currentSha = null;

async function ghLoad() {
    const res = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}?ref=${GH_BRANCH}`,
        { headers: authHeaders(), cache: 'no-store' }
    );
    if (!res.ok) throw new Error(`Couldn't load workouts from GitHub (${res.status}).`);
    const data = await res.json();
    currentSha = data.sha;
    return JSON.parse(b64ToUtf8(data.content));
}

async function ghSave(list, message) {
    if (!getToken()) {
        const err = new Error('Connect a GitHub token above before saving.');
        err.code = 'NO_TOKEN';
        throw err;
    }
    const res = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`,
        {
            method: 'PUT',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                content: utf8ToB64(JSON.stringify(list, null, 2)),
                sha: currentSha,
                branch: GH_BRANCH,
            }),
        }
    );
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `GitHub save failed (${res.status}).`);
    }
    const result = await res.json();
    currentSha = result.content.sha;
    return result;
}

// --- App state ---

let workouts = [];
let editingId = null;
let activeTab = 'All';

const editorCard = document.getElementById('editorCard');
const fTitle = document.getElementById('fTitle');
const fRank = document.getElementById('fRank');
const fBody = document.getElementById('fBody');
const btnSave = document.getElementById('btnSave');
const btnCancel = document.getElementById('btnCancel');
const tabsEl = document.getElementById('tabs');
const listEl = document.getElementById('list');
const ghStatus = document.getElementById('ghStatus');

function renderTabs() {
    const counts = countsFor(workouts);
    const total = RANKS.reduce((sum, r) => sum + counts[r], 0);
    const tabDefs = [['All', total], ...RANKS.map(r => [r, counts[r]])];

    tabsEl.innerHTML = '';
    tabDefs.forEach(([name, count]) => {
        const tab = document.createElement('button');
        tab.className = `tab${activeTab === name ? ' active' : ''}`;
        tab.textContent = `${name} (${count})`;
        tab.addEventListener('click', () => { activeTab = name; renderTabs(); renderList(); });
        tabsEl.appendChild(tab);
    });
}

function countsFor(list) {
    const counts = {};
    RANKS.forEach(r => counts[r] = 0);
    list.forEach(w => { if (counts[w.rank] !== undefined) counts[w.rank]++; });
    return counts;
}

function renderList() {
    const all = workouts.slice().sort((a, b) => a.title.localeCompare(b.title));
    const items = activeTab === 'All' ? all : all.filter(w => w.rank === activeTab);

    if (items.length === 0) {
        listEl.innerHTML = '<div class="empty-list">No workouts here yet.</div>';
        return;
    }

    listEl.innerHTML = '';
    items.forEach(w => {
        const row = document.createElement('div');
        row.className = 'workout-row';
        const snippet = (w.body || '').split('\n').map(l => l.trim()).filter(Boolean).join(' · ');
        row.innerHTML = `
            <div class="info">
                <p class="title">${escapeHtml(w.title)} <span class="rank-pill rank-${w.rank}">${w.rank}</span></p>
                <p class="snippet">${escapeHtml(snippet)}</p>
            </div>
            <div class="row-actions">
                <button class="btn small" data-act="edit">Edit</button>
                <button class="btn small danger" data-act="del">Delete</button>
            </div>
        `;
        row.querySelector('[data-act=edit]').addEventListener('click', () => startEdit(w));
        row.querySelector('[data-act=del]').addEventListener('click', () => confirmDelete(w));
        listEl.appendChild(row);
    });
}

function startEdit(w) {
    editingId = w.id;
    fTitle.value = w.title;
    fRank.value = w.rank;
    fBody.value = w.body || '';
    editorCard.hidden = false;
    editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
    editingId = null;
    fTitle.value = '';
    fRank.value = 'Tough';
    fBody.value = '';
    editorCard.hidden = true;
}

function setStatus(msg, isError) {
    ghStatus.textContent = msg;
    ghStatus.style.color = isError ? '#ff6b6b' : 'var(--muted)';
}

async function withSaving(fn) {
    setStatus('Saving to GitHub…', false);
    try {
        await fn();
        setStatus('Saved — live on GitHub, public page updates once Pages rebuilds.', false);
    } catch (err) {
        if (err.code === 'NO_TOKEN') {
            tokenCard.hidden = false;
            setStatus(err.message, true);
        } else {
            setStatus(err.message || 'Save failed.', true);
        }
        throw err;
    }
}

function confirmDelete(w) {
    if (!confirm(`Delete "${w.title}"? This can't be undone.`)) return;
    const updated = workouts.filter(x => x.id !== w.id);
    withSaving(async () => {
        await ghSave(updated, `Delete "${w.title}"`);
        workouts = updated;
        renderTabs();
        renderList();
    }).catch(() => {});
}

btnSave.addEventListener('click', () => {
    if (!editingId) return;
    const title = fTitle.value.trim();
    if (!title) { fTitle.focus(); return; }
    const updated = workouts.map(w => w.id === editingId ? { ...w, title, rank: fRank.value, body: fBody.value } : w);
    withSaving(async () => {
        await ghSave(updated, `Update "${title}"`);
        workouts = updated;
        resetForm();
        renderTabs();
        renderList();
    }).catch(() => {});
});

btnCancel.addEventListener('click', resetForm);

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

// --- Export / Import ---

document.getElementById('btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(workouts, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hybrid-arena-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

const fileImport = document.getElementById('fileImport');
document.getElementById('btnImport').addEventListener('click', () => fileImport.click());

fileImport.addEventListener('change', () => {
    const file = fileImport.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        let incoming;
        try {
            incoming = JSON.parse(reader.result);
            if (!Array.isArray(incoming)) throw new Error('not an array');
        } catch {
            alert('That file doesn\'t look like a Hybrid Arena backup.');
            return;
        }
        const existingIds = new Set(workouts.map(w => w.id));
        const merged = workouts.concat(incoming.filter(w => w && w.id && !existingIds.has(w.id)));
        withSaving(async () => {
            await ghSave(merged, `Import ${incoming.length} workout(s)`);
            workouts = merged;
            renderTabs();
            renderList();
        }).catch(() => {});
    };
    reader.readAsText(file);
    fileImport.value = '';
});

// --- Refresh ---

document.getElementById('btnRefresh').addEventListener('click', () => {
    location.href = location.pathname + '?t=' + Date.now();
});

// --- GitHub token ---

const tokenCard = document.getElementById('tokenCard');
const tokenInput = document.getElementById('tokenInput');

document.getElementById('btnSaveToken').addEventListener('click', () => {
    const t = tokenInput.value.trim();
    if (!t) return;
    localStorage.setItem(TOKEN_KEY, t);
    tokenInput.value = '';
    tokenCard.hidden = true;
    setStatus('GitHub token saved. Try your save again.', false);
});

async function initAdmin() {
    tokenCard.hidden = !!getToken();
    try {
        workouts = await ghLoad();
        setStatus('Connected — this is the live list.', false);
    } catch (err) {
        setStatus(err.message, true);
        workouts = [];
    }
    resetForm();
    renderTabs();
    renderList();
}

// --- Passcode gate ---
// Client-side only — a deterrent against casual editing, not real security
// (the code is visible in the page source). Fine for a personal tool; don't
// rely on it to protect anything sensitive.

const ADMIN_PASSCODE = '1234';
const UNLOCK_KEY = 'hybridArena.adminUnlocked';

const lockScreen = document.getElementById('lockScreen');
const adminContent = document.getElementById('adminContent');
const pinInput = document.getElementById('pinInput');
const pinError = document.getElementById('pinError');

function unlock() {
    sessionStorage.setItem(UNLOCK_KEY, '1');
    lockScreen.hidden = true;
    adminContent.hidden = false;
    initAdmin();
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
