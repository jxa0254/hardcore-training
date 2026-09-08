// store.js — shared workout storage, used by both index.html (the picker/
// board) and admin.html (load-in / ranking). Everything lives in the
// browser's localStorage as one JSON array, so there's no server or build
// step: open index.html and it works. Because it's plain localStorage, data
// does NOT sync between devices/browsers — use the Export/Import buttons on
// the Admin page to move a backup between your laptop and phone.

const STORE_KEY = 'hardcoreTraining.workouts.v1';
const RANKS = ['Tough', 'Tougher', 'Extreme'];

function loadWorkouts() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function saveWorkouts(list) {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

function addWorkout(w) {
    const list = loadWorkouts();
    list.push({
        id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        createdAt: new Date().toISOString(),
        ...w,
    });
    saveWorkouts(list);
}

function updateWorkout(id, changes) {
    const list = loadWorkouts();
    const idx = list.findIndex(w => w.id === id);
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...changes };
    saveWorkouts(list);
}

function deleteWorkout(id) {
    saveWorkouts(loadWorkouts().filter(w => w.id !== id));
}

function countsByRank() {
    const list = loadWorkouts();
    const counts = {};
    RANKS.forEach(r => counts[r] = 0);
    list.forEach(w => { if (counts[w.rank] !== undefined) counts[w.rank]++; });
    return counts;
}

/** Pick a random workout of the given rank, avoiding immediate repeats when there's a choice. */
function randomWorkout(rank, excludeId) {
    const pool = loadWorkouts().filter(w => w.rank === rank);
    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0];
    let pick;
    do {
        pick = pool[Math.floor(Math.random() * pool.length)];
    } while (pick.id === excludeId);
    return pick;
}
