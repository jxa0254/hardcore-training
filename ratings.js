// ratings.js — talks to the small Cloudflare Worker that backs both the
// crowd difficulty ratings and the hidden visitor-stats page.
//
// Ratings (1 Tough / 2 Hardcore / 3 Extreme) per workout: a workout's level
// is entirely crowd-driven, starting Unrated until someone votes. Voting is
// unlimited/repeatable on purpose (e.g. rate it again next time you do the
// workout) - there's no per-device vote lock. Used by app.js (voting) and
// admin.js (read-only level/vote-count display).
//
// Visits: app.js pings /track on every public page load (fire-and-forget);
// stats.js reads it back via /stats. Nothing IP-level is stored - just a
// timestamp, referrer, rough country (from Cloudflare's own header), and a
// trimmed user-agent string.

const RATINGS_API = 'https://hybrid-arena-ratings.rough-darkness-6e90.workers.dev';

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

/** Fire-and-forget visit ping. Never throws, never blocks the page. */
function trackVisit() {
    try {
        fetch(`${RATINGS_API}/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ref: document.referrer || '', path: location.pathname }),
            keepalive: true,
        }).catch(() => {});
    } catch {
        // ignore
    }
}

async function fetchStats() {
    const res = await fetch(`${RATINGS_API}/stats`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Stats failed (' + res.status + ')');
    return res.json();
}
