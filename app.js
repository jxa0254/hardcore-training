// app.js — the picker + board (index.html) only. Admin logic lives in admin.js.
//
// The picker reads from workouts.json, a plain file committed to this repo,
// so every visitor to the published URL sees the same list (unlike
// localStorage, which is private to one browser/device). If that fetch
// fails — e.g. testing index.html straight off disk with no server — it
// falls back to whatever's in this browser's localStorage.
//
// A workout's level (Tough/Hardcore/Extreme) is entirely crowd-rated (see
// ratings.js) — nothing is set by hand any more. A fresh workout shows
// "Unrated" until someone votes.
//
// Flow: Home lists every workout (current level shown as a pill) -> pick one
// -> board, where you can also cast your own 1-3 rating.

const workoutList = document.getElementById('workoutList');
const emptyHint = document.getElementById('emptyHint');
const homeView = document.getElementById('homeView');
const boardView = document.getElementById('boardView');
const board = document.getElementById('board');
const btnWake = document.getElementById('btnWake');

let workouts = [];
let ratings = {};
let currentWorkout = null;
let homeList = [];
let currentIndex = -1;
let loadFailed = false;
let defaultCredit = 'Dynamic Fitness';

async function fetchPublished() {
    const res = await fetch('workouts.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status ' + res.status);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('not an array');
    return data;
}

async function loadSettings() {
    try {
        const res = await fetch('settings.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data.defaultCredit === 'string' && data.defaultCredit.trim()) {
            defaultCredit = data.defaultCredit.trim();
        }
    } catch {
        // keep the built-in default
    }
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

function pillHtml(level) {
    return level
        ? `<span class="rank-pill rank-${level}">${level}</span>`
        : `<span class="rank-pill rank-Unrated">Unrated</span>`;
}

function renderHome() {
    const visible = workouts.filter(w => !w.hidden);
    emptyHint.hidden = visible.length > 0;
    emptyHint.innerHTML = loadFailed
        ? 'Couldn\'t load the workout list just now. Tap <button class="link-btn" id="btnRetryLoad">Refresh</button> to try again.'
        : 'No workouts saved yet. Head to <a href="admin.html">Admin</a> to load some in.';
    if (loadFailed) {
        document.getElementById('btnRetryLoad').addEventListener('click', () => {
            location.href = location.pathname + '?t=' + Date.now();
        });
    }

    const sorted = visible.slice().sort((a, b) => {
        const la = levelFor(ratings[a.id]);
        const lb = levelFor(ratings[b.id]);
        const ia = la ? RANKS.indexOf(la) : RANKS.length;
        const ib = lb ? RANKS.indexOf(lb) : RANKS.length;
        return ia !== ib ? ia - ib : a.title.localeCompare(b.title);
    });
    homeList = sorted;

    workoutList.innerHTML = '';
    sorted.forEach(w => {
        const btn = document.createElement('button');
        btn.className = 'workout-pick';
        btn.innerHTML = `<span class="name">${escapeHtml(w.title)}</span>${pillHtml(levelFor(ratings[w.id]))}`;
        btn.addEventListener('click', () => showWorkout(w));
        workoutList.appendChild(btn);
    });

    showView('home');
}

function showWorkout(w) {
    currentWorkout = w;
    currentIndex = homeList.findIndex(x => x.id === w.id);
    const bodyHtml = formatBody(w.body);
    const level = levelFor(ratings[w.id]);

    board.innerHTML = `
        ${pillHtml(level)}
        <h2>${escapeHtml(w.title)}</h2>
        <div class="body">${bodyHtml}</div>
        <div class="credit">This sesh was powered by ${escapeHtml(w.credit || defaultCredit)}</div>
    `;

    renderRateRow(w);
    showView('board');
}

const SLIDE_MS = 200;
let sliding = false;

/** Browse to another workout in the same list shown on Home, without going
 *  back there first - with a sliding transition in the direction of travel.
 *  Wraps around at either end. */
function showWorkoutAt(offset) {
    if (homeList.length === 0 || sliding) return;
    const next = ((currentIndex + offset) % homeList.length + homeList.length) % homeList.length;
    const target = homeList[next];

    sliding = true;
    board.classList.add(offset > 0 ? 'slide-exit-left' : 'slide-exit-right');

    setTimeout(() => {
        showWorkout(target);
        board.classList.remove('slide-exit-left', 'slide-exit-right');
        board.classList.add(offset > 0 ? 'slide-enter-right' : 'slide-enter-left');
        void board.offsetWidth; // force layout so the entry position registers before animating away from it
        board.classList.remove('slide-enter-right', 'slide-enter-left');
        setTimeout(() => { sliding = false; }, SLIDE_MS);
    }, SLIDE_MS);
}

function renderRateRow(w) {
    const rateRow = document.getElementById('rateRow');
    rateRow.innerHTML = `
        <div class="rate-label">Rate the hardness: (That's what she said :))</div>
        <div class="rate-btns">
            <button class="rate-btn" data-value="1">1 · Tough</button>
            <button class="rate-btn" data-value="2">2 · Hardcore</button>
            <button class="rate-btn" data-value="3">3 · Extreme</button>
        </div>
    `;
    rateRow.querySelectorAll('.rate-btn').forEach(btn => {
        btn.addEventListener('click', () => castVote(w, Number(btn.dataset.value)));
    });
}

async function castVote(w, value) {
    const rateRow = document.getElementById('rateRow');
    rateRow.innerHTML = '<span class="rated-note">Saving your rating…</span>';
    try {
        const result = await submitVote(w.id, value);
        ratings[w.id] = { sum: result.sum, count: result.count };
        rateRow.innerHTML = '<span class="rated-note">Thanks for rating this one! Did it again? You can rate it again any time.</span>';

        if (currentWorkout && currentWorkout.id === w.id) {
            const pill = board.querySelector('.rank-pill');
            const level = levelFor(ratings[w.id]);
            pill.className = `rank-pill rank-${level}`;
            pill.textContent = level;
        }

        setTimeout(() => {
            if (currentWorkout && currentWorkout.id === w.id) renderRateRow(w);
        }, 2500);
    } catch {
        rateRow.innerHTML = '<span class="rated-note">Couldn\'t save your rating — check your connection and try again.</span>';
    }
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

// --- Randomize ---

const randomizeModal = document.getElementById('randomizeModal');

document.getElementById('btnRandomize').addEventListener('click', () => {
    randomizeModal.hidden = false;
});

document.getElementById('btnRandomizeCancel').addEventListener('click', () => {
    randomizeModal.hidden = true;
});

document.getElementById('btnRandomizeAny').addEventListener('click', () => {
    randomizeModal.hidden = true;
    pickRandomAndShow();
});

randomizeModal.querySelectorAll('[data-level]').forEach(btn => {
    btn.addEventListener('click', () => {
        randomizeModal.hidden = true;
        pickRandomAndShow(btn.dataset.level);
    });
});

function pickRandomAndShow(level) {
    const pool = level
        ? homeList.filter(w => levelFor(ratings[w.id]) === level)
        : homeList;
    if (pool.length === 0) {
        alert(level ? `No ${level} workouts yet — try another level.` : 'No workouts to pick from yet.');
        return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    showWorkout(pick);
}

document.addEventListener('keydown', (e) => {
    if (boardView.hidden) return;
    if (e.key === 'ArrowLeft') showWorkoutAt(-1);
    if (e.key === 'ArrowRight') showWorkoutAt(1);
});

// Swipe left/right on the board to browse - handy when you don't know which
// workout you want yet and just want to flick through them.
let touchStartX = null;
const boardNavWrap = document.getElementById('boardNavWrap');
boardNavWrap.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
}, { passive: true });
boardNavWrap.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 40) return;
    showWorkoutAt(dx < 0 ? 1 : -1);
});

document.getElementById('btnRefresh').addEventListener('click', () => {
    location.href = location.pathname + '?t=' + Date.now();
});

// Cache-bust navigation to Admin too - browsers/CDNs can serve a stale
// cached copy of the destination HTML page itself, not just the JS/CSS.
document.getElementById('linkAdmin').addEventListener('click', (e) => {
    e.preventDefault();
    location.href = 'admin.html?t=' + Date.now();
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
    trackVisit();
    const [loadedWorkouts] = await Promise.all([
        loadPublishedWorkouts(),
        loadSettings(),
    ]);
    workouts = loadedWorkouts;
    ratings = await fetchRatings();
    renderHome();
})();
