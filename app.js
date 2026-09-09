// app.js — the picker + board (index.html) only. Admin logic lives in admin.js.
//
// The picker reads from workouts.json, a plain file committed to this repo,
// so every visitor to the published URL sees the same list (unlike
// localStorage, which is private to one browser/device). If that fetch
// fails — e.g. testing index.html straight off disk with no server — it
// falls back to whatever's in this browser's localStorage.
//
// Flow: Home (pick a rank) -> pick a specific workout from that rank's list
// -> board. Nothing is randomised — you always choose exactly which workout
// you see.

const rankGrid = document.getElementById('rankGrid');
const emptyHint = document.getElementById('emptyHint');
const pickView = document.getElementById('pickView');
const listView = document.getElementById('listView');
const workoutPicker = document.getElementById('workoutPicker');
const boardView = document.getElementById('boardView');
const boardWrap = document.getElementById('boardWrap');
const board = document.getElementById('board');
const wakeToggle = document.getElementById('wakeToggle');

let workouts = [];

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

function showView(view) {
    pickView.hidden = view !== 'pick';
    listView.hidden = view !== 'list';
    boardView.hidden = view !== 'board';
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

    showView('pick');
}

function pickRank(rank) {
    const items = workouts.filter(w => w.rank === rank).sort((a, b) => a.title.localeCompare(b.title));
    if (items.length === 0) return;

    workoutPicker.innerHTML = '';
    items.forEach(w => {
        const btn = document.createElement('button');
        btn.className = 'workout-pick';
        btn.innerHTML = `<span class="name">${escapeHtml(w.title)}</span><span class="rank-pill rank-${w.rank}">${w.rank}</span>`;
        btn.addEventListener('click', () => showWorkout(w));
        workoutPicker.appendChild(btn);
    });

    showView('list');
}

function showWorkout(w) {
    boardWrap.className = `board-wrap stripe-${w.rank}`;
    const bodyHtml = formatBody(w.body);

    board.innerHTML = `
        <span class="rank-pill rank-${w.rank}">${w.rank}</span>
        <h2>${escapeHtml(w.title)}</h2>
        <div class="body">${bodyHtml}</div>
        <div class="credit">This sesh was put together by DynamicFitness</div>
    `;

    showView('board');
}

function formatBody(body) {
    const lines = (body || '').split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) return '<div class="line">No details added.</div>';
    return lines.map(line => {
        if (line.endsWith(':')) {
            return `<div class="section">${escapeHtml(line.slice(0, -1))}</div>`;
        }
        return `<div class="line">- ${escapeHtml(line)}</div>`;
    }).join('');
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

document.getElementById('btnBackToRanks').addEventListener('click', renderPicker);
document.getElementById('btnHome').addEventListener('click', renderPicker);

document.getElementById('btnRefresh').addEventListener('click', () => {
    location.href = location.pathname + '?t=' + Date.now();
});

// --- Screen Wake Lock (so the board can be left running mid-workout) ---

const wakeLockSupported = 'wakeLock' in navigator;
if (!wakeLockSupported) {
    wakeToggle.disabled = true;
}

let wakeLock = null;

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
