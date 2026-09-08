// admin.js — load workouts in, edit, rank, delete. index.html/app.js is the
// separate front end that reads the same localStorage data back out.

const fTitle = document.getElementById('fTitle');
const fRank = document.getElementById('fRank');
const fBody = document.getElementById('fBody');
const btnSave = document.getElementById('btnSave');
const btnCancel = document.getElementById('btnCancel');
const tabsEl = document.getElementById('tabs');
const listEl = document.getElementById('list');

let editingId = null;
let activeTab = 'All';

function renderTabs() {
    const counts = countsByRank();
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

function renderList() {
    const all = loadWorkouts().slice().sort((a, b) => a.title.localeCompare(b.title));
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
    btnSave.textContent = 'Save Changes';
    btnCancel.hidden = false;
    fTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
    editingId = null;
    fTitle.value = '';
    fRank.value = 'Tough';
    fBody.value = '';
    btnSave.textContent = 'Save Workout';
    btnCancel.hidden = true;
}

function confirmDelete(w) {
    if (confirm(`Delete "${w.title}"? This can't be undone.`)) {
        deleteWorkout(w.id);
        renderTabs();
        renderList();
    }
}

btnSave.addEventListener('click', () => {
    const title = fTitle.value.trim();
    if (!title) { fTitle.focus(); return; }
    const data = { title, rank: fRank.value, body: fBody.value };

    if (editingId) {
        updateWorkout(editingId, data);
    } else {
        addWorkout(data);
    }
    resetForm();
    renderTabs();
    renderList();
});

btnCancel.addEventListener('click', resetForm);

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

// --- Export / Import backup ---

document.getElementById('btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(loadWorkouts(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hardcore-training-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
        try {
            const incoming = JSON.parse(reader.result);
            if (!Array.isArray(incoming)) throw new Error('not an array');
            const existing = loadWorkouts();
            const existingIds = new Set(existing.map(w => w.id));
            const merged = existing.concat(incoming.filter(w => w && w.id && !existingIds.has(w.id)));
            saveWorkouts(merged);
            renderTabs();
            renderList();
            alert(`Imported. ${merged.length} workouts total.`);
        } catch {
            alert('That file doesn\'t look like a HardCore Training backup.');
        }
    };
    reader.readAsText(file);
    fileImport.value = '';
});

resetForm();
renderTabs();
renderList();
