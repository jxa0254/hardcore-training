// ratings.js — talks to the small Cloudflare Worker that stores crowd
// difficulty ratings (1 Tough / 2 Hardcore / 3 Extreme) per workout. A
// workout's level is now entirely crowd-driven: it starts Unrated, and
// becomes the rounded average of everyone's votes once at least one person
// rates it. Shared by app.js (voting, on the public page) and admin.js
// (read-only, to show the current level/vote count per workout).

const RATINGS_API = 'https://hybrid-arena-ratings.rough-darkness-6e90.workers.dev';
const VOTED_KEY = 'hybridArena.votedWorkouts';

async function fetchRatings() {
    try {
        const res = await fetch(`${RATINGS_API}/ratings`, { cache: 'no-store' });
        if (!res.ok) throw new Error('bad status');
        const data = await res.json();
        return data && typeof data === 'object' ? data : {};
    } catch {
        return {};
    }
}

async function submitVote(id, rating) {
    const res = await fetch(`${RATINGS_API}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, rating }),
    });
    if (!res.ok) throw new Error('Vote failed (' + res.status + ')');
    return res.json();
}

/** Turn a {sum,count} rating entry into a level name, or null if unrated. */
function levelFor(entry) {
    if (!entry || !entry.count) return null;
    const avg = Math.round(entry.sum / entry.count);
    const clamped = Math.min(3, Math.max(1, avg));
    return RANKS[clamped - 1];
}

function hasVoted(id) {
    try {
        const voted = JSON.parse(localStorage.getItem(VOTED_KEY) || '[]');
        return voted.includes(id);
    } catch {
        return false;
    }
}

function markVoted(id) {
    try {
        const voted = JSON.parse(localStorage.getItem(VOTED_KEY) || '[]');
        if (!voted.includes(id)) voted.push(id);
        localStorage.setItem(VOTED_KEY, JSON.stringify(voted));
    } catch {
        // localStorage unavailable - not fatal, just means this device could re-vote
    }
}
