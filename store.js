// store.js — shared constants. `loadWorkouts()` is only a last-resort local
// fallback for app.js when workouts.json can't be fetched at all (e.g.
// testing straight off disk with no server).

const RANKS = ['Tough', 'Hardcore', 'Extreme'];

function loadWorkouts() {
    try {
        const raw = localStorage.getItem('hardcoreTraining.workouts.v1');
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}
