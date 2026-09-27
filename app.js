// app.js — the picker + board (index.html) only. Admin logic lives in admin.js.
//
// The picker reads from workouts.json, a plain file committed to this repo,
// so every visitor to the published URL sees the same list (unlike
// localStorage, which is private to one browser/device). If that fetch
// fails — e.g. testing index.html straight off disk with no server — it
// falls back to whatever's in this browser's localStorage.
//
// Flow: Home lists every workout (rank shown as a pill) -> pick one -> board.
// Nothing is randomised — you always choose exactly which workout you see.

const workoutList = document.getElementById('workoutList');
const emptyHint = document.getElementById('emptyHint');
const homeView = document.getElementById('homeView');
const boardView = document.getElementById('boardView');
const board = document.getElementById('board');
const btnWake = document.getElementById('btnWake');

let workouts = [];
let loadFailed = false;

async function fetchPublished() {
    const res = await fetch('workouts.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('not an array');
    return data;
}

/** The very first fetch on a fresh page load occasionally fails for
 *  reasons that have nothing to do with the data (a flaky connection, a
 *  cold CDN edge right after a deploy) - retry once before giving up. */
async function loadPublishedWorkouts() {
    try {
        return await fetchPublished();
    } catch {
        // one retry after a short pause
    }
    try {
        await new Promise(r => setTimeout(r, 600));
        return await fetchPublished();
    } catch {
        loadFailed = true;
    }
    return loadWorkouts();
}

function showView(view) {
    homeView.hidden = view !== 'home';
    boardView.hidden = view !== 'board';
}

function renderHome() {
    emptyHint.hidden = workouts.length > 0;
    emptyHint.innerHTML = loadFailed
        ? 'Couldn\'t load the workout list just now. Tap <button class="link-btn" id="btnRetryLoad">Refresh</button> to try again.'
        : 'No workouts saved yet. Head to <a href="admin.html">Admin</a> to load some in.';
    if (loadFailed) {
        document.getElementById('btnRetryLoad').addEventListener('click', () => {
            location.href = location.pathname + '?t=' + Date.now();
        });
    }

    const sorted = workouts.slice().sort((a, b) => {
        const byRank = RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);
        return byRank !== 0 ? byRank : a.title.localeCompare(b.title);
    });

    workoutList.innerHTML = '';
    sorted.forEach(w => {
        const btn = document.createElement('button');
        btn.className = 'workout-pick';
        btn.innerHTML = `<span class="name">${escapeHtml(w.title)}</span><span class="rank-pill rank-${w.rank}">${w.rank}</span>`;
        btn.addEventListener('click', () => showWorkout(w));
        workoutList.appendChild(btn);
    });

    showView('home');
}

function showWorkout(w) {
    const bodyHtml = formatBody(w.body);

    board.innerHTML = `
        <span class="rank-pill rank-${w.rank}">${w.rank}</span>
        <h2>${escapeHtml(w.title)}</h2>
        <div class="body">${bodyHtml}</div>
        <div class="credit">This sesh was put together by ${escapeHtml(w.credit || 'DynamicFitness')}</div>
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
        return `<div class="line">${formatLine(line)}</div>`;
    }).join('');
}

/** Colour-code a line like the gym's own whiteboards: a leading number/
 *  distance in blue, the exercise name in black, a trailing "(note)" in red. */
function formatLine(line) {
    let rest = line;
    let note = '';
    const noteMatch = rest.match(/\s*(\([^)]*\))\s*$/);
    if (noteMatch) {
        note = noteMatch[1];
        rest = rest.slice(0, noteMatch.index).trim();
    }

    let num = '';
    let txt = rest;
    const numMatch = rest.match(/^([\d/.]+[a-zA-Z]*)\s+(.*)$/);
    if (numMatch) {
        num = numMatch[1];
        txt = numMatch[2];
    }

    let html = '';
    if (num) html += `<span class="num">${escapeHtml(num)}</span>`;
    if (txt) html += `<span class="txt">${escapeHtml(txt)}</span>`;
    if (note) html += `<span class="note">${escapeHtml(note)}</span>`;
    return html || escapeHtml(line);
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

document.getElementById('btnHome').addEventListener('click', renderHome);

document.getElementById('btnRefresh').addEventListener('click', () => {
    location.href = location.pathname + '?t=' + Date.now();
});

// --- Screen Wake Lock (so the board can be left running mid-workout) ---

const wakeLockSupported = 'wakeLock' in navigator;
if (!wakeLockSupported) {
    btnWake.disabled = true;
}

let wakeLock = null;
let wakeWanted = false;

async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
        wakeWanted = false;
        btnWake.classList.remove('active');
    }
}

btnWake.addEventListener('click', () => {
    wakeWanted = !wakeWanted;
    btnWake.classList.toggle('active', wakeWanted);
    if (wakeWanted) {
        requestWakeLock();
    } else if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
});

document.addEventListener('visibilitychange', () => {
    if (wakeWanted && document.visibilityState === 'visible' && !wakeLock) {
        requestWakeLock();
    }
});

(async function init() {
    workouts = await loadPublishedWorkouts();
    renderHome();
})();
