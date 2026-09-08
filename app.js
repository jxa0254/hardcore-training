// app.js — the picker + board (index.html) only. Admin logic lives in admin.js.
//
// The picker reads from workouts.json, a plain file committed to this repo,
// so every visitor to the published URL sees the same list (unlike
// localStorage, which is private to one browser/device). If that fetch
// fails — e.g. testing index.html straight off disk with no server — it
// falls back to whatever's in this browser's localStorage.

const rankGrid = document.getElementById('rankGrid');
const emptyHint = document.getElementById('emptyHint');
const pickView = document.getElementById('pickView');
const boardView = document.getElementById('boardView');
const boardWrap = document.getElementById('boardWrap');
const board = document.getElementById('board');
const wakeToggle = document.getElementById('wakeToggle');

let workouts = [];
let currentRank = null;
let currentWorkout = null;
let wakeLock = null;

async function loadPublishedWorkouts() {
    try {
        const res = await fetch('workouts.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('no workouts.json');
        const data = await res.json();
        if (Array.isArray(data)) return data;
    } catch {
        // fall through to local fallback
    }
    return loadWorkouts();
}

function countsFor(list) {
    const counts = {};
    RANKS.forEach(r => counts[r] = 0);
    list.forEach(w => { if (counts[w.rank] !== undefined) counts[w.rank]++; });
    return counts;
}

function randomFrom(list, rank, excludeId) {
    const pool = list.filter(w => w.rank === rank);
    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0];
    let pick;
    do {
        pick = pool[Math.floor(Math.random() * pool.length)];
    } while (pick.id === excludeId);
    return pick;
}

function renderPicker() {
    const counts = countsFor(workouts);
    const total = RANKS.reduce((sum, r) => sum + counts[r], 0);
    emptyHint.hidden = total > 0;

    rankGrid.innerHTML = '';
    RANKS.forEach(rank => {
        const n = counts[rank];
        const btn = document.createElement('button');
        btn.className = `rank-card rank-${rank}`;
        btn.disabled = n === 0;
        btn.innerHTML = `<span class="name">${rank}</span><span class="count">${n} workout${n === 1 ? '' : 's'}</span>`;
        btn.addEventListener('click', () => pickRank(rank));
        rankGrid.appendChild(btn);
    });
}

function pickRank(rank) {
    const w = randomFrom(workouts, rank);
    if (!w) return;
    currentRank = rank;
    showWorkout(w);
    pickView.hidden = true;
    boardView.hidden = false;
}

function showWorkout(w) {
    currentWorkout = w;
    boardWrap.className = `board-wrap stripe-${w.rank}`;

    const counts = countsFor(workouts);
    const bodyHtml = formatBody(w.body);

    board.innerHTML = `
        <span class="rank-pill rank-${w.rank}">${w.rank}</span>
        <h2>${escapeHtml(w.title)}</h2>
        <div class="meta">1 of ${counts[w.rank]} ${w.rank} workout${counts[w.rank] === 1 ? '' : 's'}</div>
        <div class="body">${bodyHtml}</div>
    `;
}

function formatBody(body) {
    const lines = (body || '').split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) return '<div class="line">No details added.</div>';
    return lines.map(line => {
        if (line.endsWith(':')) {
            return `<div class="section">${escapeHtml(line.slice(0, -1))}</div>`;
        }
        return `<div class="line">💪 ${escapeHtml(line)}</div>`;
    }).join('');
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

document.getElementById('btnAnother').addEventListener('click', () => {
    const w = randomFrom(workouts, currentRank, currentWorkout ? currentWorkout.id : null);
    if (w) showWorkout(w);
});

document.getElementById('btnChangeRank').addEventListener('click', () => {
    boardView.hidden = true;
    pickView.hidden = false;
    renderPicker();
});

// --- Screen Wake Lock (so the board can be left running mid-workout) ---

const wakeLockSupported = 'wakeLock' in navigator;
if (!wakeLockSupported) {
    wakeToggle.disabled = true;
}

async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
        wakeToggle.checked = false;
    }
}

wakeToggle.addEventListener('change', () => {
    if (wakeToggle.checked) {
        requestWakeLock();
    } else if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
});

document.addEventListener('visibilitychange', () => {
    if (wakeToggle.checked && document.visibilityState === 'visible' && !wakeLock) {
        requestWakeLock();
    }
});

(async function init() {
    workouts = await loadPublishedWorkouts();
    renderPicker();
})();
