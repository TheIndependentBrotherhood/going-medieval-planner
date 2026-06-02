'use strict';

/* ──────────────────────────────────────────────────────────────────────────────
   Going Medieval Planner — Main Application
   ────────────────────────────────────────────────────────────────────────────── */

let _activeTab = 'colonists';
let _editingId = null; // colonist being edited in modal

// Lock state for combined-method weight sliders (not persisted)
const _lockedWeights = { desire: false, expertise: false, learning: false };

// ── Icon helpers ──────────────────────────────────────────────────────────────

function skillIcon(skill, size = 18) {
  const url = SKILL_ICONS[skill];
  if (!url) return '';
  return `<img src="${url}" alt="" width="${size}" height="${size}" class="label-icon" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

function taskIcon(task, size = 18) {
  const url = TASK_ICONS[task];
  if (!url) return '';
  return `<img src="${url}" alt="" width="${size}" height="${size}" class="label-icon" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  Store.load();
  bindNav();
  bindHeader();
  renderTab(_activeTab);
});

// ── Navigation ────────────────────────────────────────────────────────────────

function bindNav() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTab(_activeTab);
    });
  });
}

function renderTab(tab) {
  const content = document.getElementById('tab-content');
  switch (tab) {
    case 'colonists':  content.innerHTML = renderColonistsTab();  break;
    case 'combat':     content.innerHTML = renderCombatTab();     break;
    case 'schedules':  content.innerHTML = renderSchedulesTab();  break;
    case 'priorities': content.innerHTML = renderPrioritiesTab(); break;
    case 'summary':    content.innerHTML = renderSummaryTab();    break;
    case 'colony':     content.innerHTML = renderColonyTab();     break;
  }
  bindTabEvents(tab);
  updateColonyHeader();
}

// ── Header / saves ────────────────────────────────────────────────────────────

function bindHeader() {
  document.getElementById('btn-saves').addEventListener('click', openSavesModal);
  document.getElementById('btn-new-colony').addEventListener('click', () => {
    openPromptModal('Nom de la nouvelle colonie', 'Nouvelle Colonie', name => {
      Store.createColony(name);
      renderTab(_activeTab);
    });
  });
}

function updateColonyHeader() {
  const c = Store.current();
  document.getElementById('colony-name').textContent = c ? c.name : '—';
  const n = c ? c.colonists.length : 0;
  document.getElementById('colonist-count').textContent = c
    ? `${n} colon${n !== 1 ? 's' : ''}` : '';
}

// ── Saves modal ───────────────────────────────────────────────────────────────

function openSavesModal() {
  const saves  = Store.allSaves();
  const active = Store.current().id;
  const rows   = saves.map(s => `
    <div class="save-row ${s.id === active ? 'active-save' : ''}">
      <span class="save-name">${esc(s.name)}</span>
      <div class="save-actions">
        ${s.id !== active
          ? `<button class="btn-sm btn-primary" onclick="switchSave('${s.id}')">Charger</button>`
          : '<span class="badge-active">Actif</span>'}
        <button class="btn-sm btn-danger" onclick="deleteSave('${s.id}')">Supprimer</button>
      </div>
    </div>`).join('');

  openModal(`
    <h2>💾 Sauvegardes</h2>
    <div class="saves-list">${rows || '<p>Aucune sauvegarde.</p>'}</div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
    </div>`);
}

function switchSave(id) {
  Store.switchTo(id);
  closeModal();
  renderTab(_activeTab);
}

function deleteSave(id) {
  if (!confirm('Supprimer cette colonie ? Cette action est irréversible.')) return;
  if (!Store.deleteColony(id)) { alert('Impossible de supprimer la dernière colonie.'); return; }
  openSavesModal();
  renderTab(_activeTab);
}

// ── Colony settings tab ───────────────────────────────────────────────────────

function renderMethodWeightsSection(c) {
  return `
    <h4>Pondération de la méthode combinée</h4>
    ${[['desire','Envies'],['expertise','Expertise'],['learning','Apprentissage']].map(([k,lbl]) => `
      <div class="form-row weight-row">
        <button class="weight-lock-btn ${_lockedWeights[k] ? 'locked' : ''}"
          onclick="toggleWeightLock('${k}')" title="${_lockedWeights[k] ? 'Déverrouiller' : 'Verrouiller'}">
          ${_lockedWeights[k] ? '🔒' : '🔓'}
        </button>
        <label>${lbl}</label>
        <input type="range" id="weight-${k}" min="0" max="100" value="${c.methodWeights[k]}"
          class="slider" ${_lockedWeights[k] ? 'disabled' : ''} oninput="updateWeight('${k}', this.value)">
        <span class="weight-val" id="weight-val-${k}">${c.methodWeights[k]}</span>%
      </div>`).join('')}
    <div class="weight-total" id="weight-total">
      Total : <span id="weight-total-val">${Object.values(c.methodWeights).reduce((a,b)=>a+b,0)}</span>%
    </div>`;
}

function renderColonyTab() {
  const c = Store.current();
  return `
    <section class="card">
      <h2>⚙️ Paramètres de la colonie</h2>
      <div class="form-row">
        <label>Nom de la colonie</label>
        <input id="colony-name-input" type="text" value="${esc(c.name)}" class="input-field">
        <button class="btn btn-primary" onclick="saveColonyName()">Enregistrer</button>
      </div>

      <h3>Méthode de calcul des priorités</h3>
      <div class="radio-group">
        ${CALC_METHODS.map(m => `
          <label class="radio-card ${c.calculationMethod === m.id ? 'selected' : ''}">
            <input type="radio" name="calc-method" value="${m.id}"
              ${c.calculationMethod === m.id ? 'checked' : ''}>
            <strong>${m.label}</strong>
            <small>${m.desc}</small>
          </label>`).join('')}
      </div>

      <div id="method-weights-section" ${c.calculationMethod !== 'combined' ? 'class="hidden"' : ''}>
        ${renderMethodWeightsSection(c)}
      </div>

      <h3>Gestion des envies négatives</h3>
      <div class="radio-group">
        <label class="radio-card ${c.negativeDesireMode === 'forbid' ? 'selected' : ''}">
          <input type="radio" name="neg-mode" value="forbid"
            ${c.negativeDesireMode === 'forbid' ? 'checked' : ''}>
          <strong>Interdire (priorité 0)</strong>
          <small>Les tâches détestées sont interdites.</small>
        </label>
        <label class="radio-card ${c.negativeDesireMode === 'lowest' ? 'selected' : ''}">
          <input type="radio" name="neg-mode" value="lowest"
            ${c.negativeDesireMode === 'lowest' ? 'checked' : ''}>
          <strong>Priorité basse</strong>
          <small>Les tâches détestées reçoivent la priorité ci-dessous.</small>
        </label>
      </div>
      <div id="neg-prio-row" ${c.negativeDesireMode !== 'lowest' ? 'class="hidden"' : ''} style="margin-top:8px">
        <label>Priorité pour envies négatives&nbsp;
          <select id="neg-prio-select" class="input-field-sm">
            ${[1,2,3,4,5].map(v =>
              `<option value="${v}" ${c.negativeDesirePrio === v ? 'selected' : ''}>${v}</option>`
            ).join('')}
          </select>
        </label>
      </div>

      <h3>Limite de colons par tâche</h3>
      <p class="hint">Pourcentage maximum de colons pouvant recevoir la priorité 1 pour une même tâche.
        Réduire cette valeur évite que trop de colons se retrouvent avec la même priorité haute, ce qui serait contre-productif.</p>
      <div class="form-row weight-row">
        <label>% max de colons à priorité 1 par tâche</label>
        <input type="range" id="max-colonists-pct" min="10" max="100" step="5"
          value="${c.maxColonistsPerTaskPct ?? 100}"
          class="slider" oninput="updateMaxColonistsPct(this.value)">
        <span class="weight-val" id="max-colonists-pct-val">${c.maxColonistsPerTaskPct ?? 100}</span>%
      </div>

      <h3>Importance des tâches</h3>
      <p class="hint">1 = critique · 3 = normale · 5 = peu importante. Influence le calcul automatique.</p>
      <div class="task-weights-grid">
        ${TASKS.map(t => `
          <div class="tw-row">
            <span class="tw-name">${taskIcon(t)}${esc(t)}</span>
            <input type="range" min="1" max="5" value="${c.taskWeights[t] || 3}" class="slider"
              oninput="updateTaskWeight('${t}', this.value)">
            <span class="tw-val" id="tw-val-${slugify(t)}">${c.taskWeights[t] || 3}</span>
          </div>`).join('')}
      </div>
    </section>`;
}

function saveColonyName() {
  const val = document.getElementById('colony-name-input')?.value?.trim();
  if (val) { Store.updateColony({ name: val }); updateColonyHeader(); }
}

function toggleWeightLock(key) {
  // Radio behaviour: at most one slider locked at a time.
  // Clicking the already-locked slider unlocks it; clicking another unlocks the old one first.
  const wasLocked = _lockedWeights[key];
  Object.keys(_lockedWeights).forEach(k => { _lockedWeights[k] = false; });
  if (!wasLocked) _lockedWeights[key] = true;
  // Re-render weight section to reflect lock state
  const c = Store.current();
  const section = document.getElementById('method-weights-section');
  if (!section) return;
  section.innerHTML = renderMethodWeightsSection(c);
}

function updateWeight(key, val) {
  const keys = ['desire', 'expertise', 'learning'];
  const c = Store.current();
  const newVal = Number(val);

  // Compute the budget available for non-locked sliders (excluding the one being dragged)
  let lockedSum = 0;
  keys.forEach(k => {
    if (k !== key && _lockedWeights[k]) lockedSum += c.methodWeights[k];
  });

  // Clamp dragged value so total doesn't exceed 100
  const maxVal = Math.max(0, 100 - lockedSum);
  const clamped = Math.min(newVal, maxVal);

  // Distribute remaining budget among free (non-locked, non-dragged) sliders
  const remaining = maxVal - clamped;
  const freeKeys = keys.filter(k => k !== key && !_lockedWeights[k]);

  const newWeights = { ...c.methodWeights };
  newWeights[key] = clamped;

  if (freeKeys.length > 0) {
    const currentFreeTotal = freeKeys.reduce((s, k) => s + c.methodWeights[k], 0);
    if (currentFreeTotal > 0) {
      // Distribute proportionally to current values
      let distributed = 0;
      freeKeys.forEach((k, i) => {
        if (i === freeKeys.length - 1) {
          newWeights[k] = remaining - distributed;
        } else {
          const share = Math.round(remaining * c.methodWeights[k] / currentFreeTotal);
          newWeights[k] = share;
          distributed += share;
        }
      });
    } else {
      // Distribute equally
      const share = Math.floor(remaining / freeKeys.length);
      let remainder = remaining - share * freeKeys.length;
      freeKeys.forEach(k => {
        newWeights[k] = share + (remainder-- > 0 ? 1 : 0);
      });
    }
  }

  // Update DOM
  keys.forEach(k => {
    const valEl = document.getElementById(`weight-val-${k}`);
    if (valEl) valEl.textContent = newWeights[k];
    const sliderEl = document.getElementById(`weight-${k}`);
    if (sliderEl && k !== key) sliderEl.value = newWeights[k];
  });
  const totalEl = document.getElementById('weight-total-val');
  if (totalEl) totalEl.textContent = Object.values(newWeights).reduce((a,b)=>a+b,0);

  // Sync dragged slider display value in case it was clamped
  const draggedEl = document.getElementById(`weight-${key}`);
  if (draggedEl) draggedEl.value = clamped;

  Store.updateColony({ methodWeights: newWeights });
}

function updateTaskWeight(task, val) {
  const el = document.getElementById(`tw-val-${slugify(task)}`);
  if (el) el.textContent = val;
  const c = Store.current();
  c.taskWeights[task] = Number(val);
  Store.updateColony({ taskWeights: c.taskWeights });
}

function updateMaxColonistsPct(val) {
  const el = document.getElementById('max-colonists-pct-val');
  if (el) el.textContent = val;
  Store.updateColony({ maxColonistsPerTaskPct: Number(val) });
}

// ── Colonists tab ─────────────────────────────────────────────────────────────

function renderColonistsTab() {
  const c = Store.current();
  const cards = c.colonists.map(renderColonistCard).join('');
  return `
    <section class="card">
      <div class="section-header">
        <h2>👥 Colons (${c.colonists.length})</h2>
        <button id="btn-add-colonist" class="btn btn-primary">+ Ajouter un colon</button>
      </div>
      ${c.colonists.length === 0
        ? '<p class="hint">Aucun colon. Cliquez sur « Ajouter un colon » pour commencer.</p>'
        : `<div class="colonist-grid">${cards}</div>`}
    </section>`;
}

function renderColonistCard(colonist) {
  const roleLabel = colonist.combatRole
    ? (COMBAT_ROLES.find(r => r.id === colonist.combatRole)?.label || '—')
    : '—';

  const topSkills = [...SKILLS]
    .sort((a, b) => colonist.skills[b] - colonist.skills[a])
    .slice(0, 3)
    .map(s => `<span class="skill-pill">${skillIcon(s)}${esc(s)} ${colonist.skills[s]}</span>`)
    .join('');

  const desireRow = SKILLS.map(s => {
    const d     = colonist.desires[s];
    const color = d > 0 ? '#22c55e' : d < 0 ? '#ef4444' : '#6b7280';
    return `<span style="color:${color}" title="${esc(s)}: ${d >= 0 ? '+' : ''}${d}">${d >= 0 ? '+' : ''}${d}</span>`;
  }).join('');

  return `
    <div class="colonist-card">
      <div class="card-header">
        <span class="colonist-name">${esc(colonist.name)}</span>
        <div class="card-badges">
          <span class="badge badge-schedule">Planning ${colonist.schedule}</span>
          <span class="badge badge-role">${esc(roleLabel)}</span>
        </div>
      </div>
      <div class="top-skills">${topSkills || '<em>Pas de compétences</em>'}</div>
      <div class="desire-row" title="Envies par compétence">${desireRow}</div>
      <div class="card-actions">
        <button class="btn-sm btn-primary" onclick="openColonistModal('${colonist.id}')">✏️ Éditer</button>
        <button class="btn-sm btn-secondary" onclick="changeSchedule('${colonist.id}')">📅 Changer planning</button>
        <button class="btn-sm btn-danger" onclick="deleteColonist('${colonist.id}')">🗑️ Supprimer</button>
      </div>
    </div>`;
}

function changeSchedule(id) {
  const c = Store.getColonist(id);
  if (c) Store.updateColonist(id, { schedule: c.schedule === 'A' ? 'B' : 'A' });
  renderTab('colonists');
}

function deleteColonist(id) {
  const c = Store.getColonist(id);
  if (!c || !confirm(`Supprimer ${c.name} ?`)) return;
  Store.removeColonist(id);
  renderTab('colonists');
}

// ── Colonist edit modal ───────────────────────────────────────────────────────

function openColonistModal(id) {
  _editingId = id;
  const c = Store.getColonist(id);
  if (!c) return;

  const skillRows = SKILLS.map(s => {
    const slug = slugify(s);
    return `
      <tr>
        <td class="skill-name-cell">${skillIcon(s)}${esc(s)}</td>
        <td>
          <div class="skill-input-row">
            <input type="range" min="0" max="50" value="${c.skills[s]}" class="slider" id="skill-${slug}"
              oninput="document.getElementById('sv-${slug}').textContent=this.value">
            <span class="skill-val" id="sv-${slug}">${c.skills[s]}</span>
          </div>
        </td>
        <td>
          <select class="input-field-sm desire-select" id="desire-${slug}">
            ${[-2,-1,0,1,2].map(v =>
              `<option value="${v}" ${c.desires[s] === v ? 'selected' : ''}>${DESIRE_LABELS[String(v)]}</option>`
            ).join('')}
          </select>
        </td>
      </tr>`;
  }).join('');

  openModal(`
    <h2>✏️ ${esc(c.name)}</h2>
    <div class="form-row" style="margin-bottom:16px">
      <label>Nom</label>
      <input id="edit-name" type="text" value="${esc(c.name)}" class="input-field">
    </div>
    <h3>Compétences &amp; Envies</h3>
    <p class="hint">Niveau : 0–50 &nbsp;·&nbsp; Envie : 😡−2 à 😍+2</p>
    <div class="table-scroll">
      <table class="skills-table">
        <thead><tr><th>Compétence</th><th>Niveau (0–50)</th><th>Envie</th></tr></thead>
        <tbody>${skillRows}</tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveColonistModal()">💾 Enregistrer</button>
    </div>`);
}

function saveColonistModal() {
  if (!_editingId) return;
  const name    = document.getElementById('edit-name')?.value?.trim() || 'Colon';
  const skills  = {};
  const desires = {};
  SKILLS.forEach(s => {
    const slug = slugify(s);
    skills[s]  = Number(document.getElementById(`skill-${slug}`)?.value  ?? 0);
    desires[s] = Number(document.getElementById(`desire-${slug}`)?.value ?? 0);
  });
  Store.updateColonist(_editingId, { name, skills, desires });
  closeModal();
  renderTab('colonists');
}

// ── Combat tab ────────────────────────────────────────────────────────────────

function renderCombatTab() {
  const colony    = Store.current();
  const pcts      = colony.combatRolePercents;
  const colonists = colony.colonists;
  const total     = COMBAT_ROLES.reduce((s, r) => s + (pcts[r.id] || 0), 0);
  const warnPct   = total !== 100
    ? `<p class="warning">⚠️ Le total des pourcentages est ${total}% (doit être 100%).</p>` : '';

  const n = colonists.length;
  const roleSections = COMBAT_ROLES.map(role => {
    const assigned = colonists.filter(c => c.combatRole === role.id);
    const pills    = assigned.map(c => `<span class="col-pill">${esc(c.name)}</span>`).join('');
    const count    = Math.round((pcts[role.id] || 0) / 100 * n);
    return `
      <div class="role-section">
        <div class="role-header">
          <span class="role-label">${role.label}</span>
          <div class="pct-input-row">
            <input type="number" min="0" max="100" value="${pcts[role.id] || 0}"
              class="input-field-sm combat-pct-input" data-role="${role.id}">%
          </div>
          <span class="role-count" id="rcount-${role.id}">
            ~${count} colon${count !== 1 ? 's' : ''}
          </span>
        </div>
        <div class="assigned-pills">${pills || '<em>Aucun assigné</em>'}</div>
      </div>`;
  }).join('');

  const overrideRows = colonists.map(c => {
    const opts = `<option value="">— Aucun rôle —</option>` +
      COMBAT_ROLES.map(r =>
        `<option value="${r.id}" ${c.combatRole === r.id ? 'selected' : ''}>${r.label}</option>`
      ).join('');
    return `
      <tr>
        <td>${esc(c.name)}</td>
        <td>
          <select class="input-field-sm role-override" data-col="${c.id}">${opts}</select>
        </td>
      </tr>`;
  }).join('');

  return `
    <section class="card">
      <div class="section-header">
        <h2>⚔️ Rôles de combat</h2>
        <button id="btn-auto-assign" class="btn btn-primary">⚡ Auto-assigner</button>
      </div>
      ${warnPct}
      <p class="hint">La chasse (arc) est réservée aux archers. Formation utilise Tireur + Corps à corps.</p>
      <div class="roles-grid">${roleSections}</div>
      ${colonists.length ? `
        <h3>Affectation manuelle</h3>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Colon</th><th>Rôle</th></tr></thead>
            <tbody>${overrideRows}</tbody>
          </table>
        </div>` : ''}
    </section>`;
}

// ── Schedules tab ─────────────────────────────────────────────────────────────

function renderSchedulesTab() {
  const colony    = Store.current();
  const colonists = colony.colonists;
  const warn      = !hasCommonLeisure(colony) && colonists.length >= 2
    ? `<p class="warning">⚠️ Aucune période commune de Loisirs (L) ou N'importe (N) entre les colons. Les relations risquent d'en souffrir.</p>`
    : '';

  const legend = SCHEDULE_STATES.map(s =>
    `<span class="legend-item" style="background:${SCHEDULE_STATE_COLORS[s]}">${s} – ${SCHEDULE_STATE_LABELS[s]}</span>`
  ).join('');

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const grids = ['A', 'B'].map(sch => {
    const inSch = colonists.filter(c => c.schedule === sch);
    const cells = colony.schedules[sch].map((state, h) => `
      <td class="schedule-cell" data-sch="${sch}" data-hour="${h}"
        style="background:${SCHEDULE_STATE_COLORS[state]}"
        title="${h}h – ${SCHEDULE_STATE_LABELS[state]}">${state}</td>`).join('');

    return `
      <div class="schedule-block">
        <h3>Planning ${sch}
          <span class="badge">${inSch.length} colon${inSch.length !== 1 ? 's' : ''}:
            ${inSch.map(c => esc(c.name)).join(', ') || 'aucun'}
          </span>
        </h3>
        <div class="table-scroll">
          <table class="schedule-table">
            <thead><tr>${hours.map(h => `<th>${h}h</th>`).join('')}</tr></thead>
            <tbody><tr>${cells}</tr></tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  return `
    <section class="card">
      <div class="section-header">
        <h2>📅 Plannings</h2>
        <div class="prio-actions">
          <button id="btn-auto-assign-schedules" class="btn btn-primary">⚡ Auto-assigner</button>
          <button id="btn-reset-schedules" class="btn btn-secondary">↺ Réinitialiser</button>
        </div>
      </div>
      ${warn}
      <div class="legend">${legend}</div>
      <p class="hint">Cliquez sur une cellule pour changer son état (cycle T→S→N→L→F→T).</p>
      ${grids}
    </section>`;
}

// ── Priorities tab ────────────────────────────────────────────────────────────

function renderPrioritiesTab() {
  const colony    = Store.current();
  const colonists = colony.colonists;

  if (!colonists.length) return `
    <section class="card">
      <h2>📋 Priorités des tâches</h2>
      <p class="hint">Ajoutez des colons dans l'onglet Colons pour gérer leurs priorités.</p>
    </section>`;

  const taskHeaders = TASKS.map(task =>
    `<th class="prio-task-header" title="${esc(task)}">${esc(task)}</th>`
  ).join('');

  const rows = colonists.map(c => {
    const cells = TASKS.map(task => {
      const prio   = c.taskPriorities[task] ?? 3;
      const manual = c.manualOverrides?.[task] ? ' manual' : '';
      return `
        <td class="prio-cell${manual}" data-col="${c.id}" data-task="${esc(task)}" data-prio="${prio}"
          style="background:${PRIORITY_COLORS[prio]}"
          title="${prio === 0 ? 'Interdit' : `Priorité ${prio}`}${manual ? ' (manuel)' : ''}">
          ${PRIORITY_LABELS[prio]}
        </td>`;
    }).join('');

    return `
      <tr>
        <td class="prio-colon-name-cell">${esc(c.name)}</td>
        ${cells}
      </tr>`;
  }).join('');

  return `
    <section class="card prio-section">
      <div class="section-header">
        <h2>📋 Priorités des tâches</h2>
        <div class="prio-actions">
          <button id="btn-calc-priorities" class="btn btn-primary">⚡ Calculer automatiquement</button>
          <button id="btn-reset-overrides" class="btn btn-secondary">↺ Effacer remplacements</button>
        </div>
      </div>
      <p class="hint">Cliquez sur une cellule pour modifier manuellement (cycle 0→5→0). <strong>Surligné</strong> = modifié manuellement.</p>
      <div class="prio-legend">
        ${Object.entries(PRIORITY_COLORS).map(([k, v]) =>
          `<span class="legend-item" style="background:${v}">${k === '0' ? '🚫 Interdit' : `Priorité ${k}`}</span>`
        ).join('')}
      </div>
      <div class="table-scroll">
        <table class="prio-table">
          <thead><tr><th class="prio-colon-header">Colon</th>${taskHeaders}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

// ── Summary tab ───────────────────────────────────────────────────────────────

function renderSummaryTab() {
  const colony    = Store.current();
  const colonists = colony.colonists;

  if (!colonists.length) return `
    <section class="card">
      <h2>📊 Résumé</h2>
      <p class="hint">Ajoutez des colons pour voir le résumé.</p>
    </section>`;

  const leisureWarn = !hasCommonLeisure(colony) && colonists.length >= 2
    ? `<p class="warning">⚠️ Aucune période de loisirs commune entre les colons.</p>` : '';

  const schedSummary = ['A', 'B'].map(sch => {
    const inSch = colonists.filter(c => c.schedule === sch);
    if (!inSch.length) return '';
    const workH = colony.schedules[sch].filter(h => h === 'T').length;
    return `<div><strong>Planning ${sch}</strong> (${workH}h de travail) : ${inSch.map(c => esc(c.name)).join(', ')}</div>`;
  }).join('');

  const taskSummary = TASKS.map(task => {
    const skill        = TASK_SKILLS[task];
    const isFormation  = task === 'Formation';

    const assigned = colonists
      .filter(c => (c.taskPriorities[task] ?? 0) > 0)
      .sort((a, b) => (a.taskPriorities[task] ?? 0) - (b.taskPriorities[task] ?? 0))
      .map(c => {
        const p = c.taskPriorities[task];

        // Priority badge
        const prioBadge = `<span class="pill-badge">⭐ ${p}</span>`;

        // Skill badge (Formation uses two skills)
        let skillBadge = '';
        if (isFormation) {
          const lvlT = c.skills['Tireur']        ?? 0;
          const lvlC = c.skills['Corps à corps'] ?? 0;
          skillBadge = `<span class="pill-badge">${skillIcon('Tireur', 13)}${lvlT} ${skillIcon('Corps à corps', 13)}${lvlC}</span>`;
        } else if (skill) {
          const lvl = c.skills[skill] ?? 0;
          skillBadge = `<span class="pill-badge">${skillIcon(skill, 13)}${lvl}</span>`;
        }

        return `<span class="col-prio-pill" style="background:${PRIORITY_COLORS[p]}">${esc(c.name)}${prioBadge}${skillBadge}</span>`;
      }).join(' ');

    const forbidden = colonists
      .filter(c => (c.taskPriorities[task] ?? 0) === 0)
      .map(c => `<span class="col-forbidden-pill">${esc(c.name)}</span>`)
      .join(' ');

    return `
      <tr>
        <td class="task-name-cell">${taskIcon(task)}${esc(task)}</td>
        <td>${assigned || '<em>Tous interdits</em>'}</td>
        <td>${forbidden || '—'}</td>
      </tr>`;
  }).join('');

  return `
    <section class="card">
      <div class="section-header">
        <h2>📊 Résumé de la colonie</h2>
        <button class="btn btn-secondary" onclick="exportTable()">📋 Copier (TSV)</button>
      </div>
      ${leisureWarn}
      <h3>Plannings</h3>
      <div class="sched-summary">${schedSummary}</div>
      <h3>Affectation par tâche</h3>
      <div class="table-scroll">
        <table class="data-table summary-table">
          <thead>
            <tr><th>Tâche</th><th>Assignés (par priorité croissante)</th><th>Interdits</th></tr>
          </thead>
          <tbody>${taskSummary}</tbody>
        </table>
      </div>
    </section>`;
}

function exportTable() {
  const colony    = Store.current();
  const colonists = colony.colonists;
  const header    = ['Colon', ...TASKS].join('\t');
  const rows      = colonists.map(c =>
    [c.name, ...TASKS.map(task => c.taskPriorities[task] ?? 3)].join('\t')
  );
  const text = [header, ...rows].join('\n');
  navigator.clipboard.writeText(text)
    .then(() => alert('Tableau copié ! Collez-le dans Excel ou Google Sheets.'))
    .catch(() => alert('Impossible de copier automatiquement. Sélectionnez le tableau manuellement.'));
}

// ── Tab event bindings ────────────────────────────────────────────────────────

function bindTabEvents(tab) {
  if (tab === 'colony') {
    document.querySelectorAll('input[name="calc-method"]').forEach(r => {
      r.addEventListener('change', e => {
        Store.updateColony({ calculationMethod: e.target.value });
        const sec = document.getElementById('method-weights-section');
        if (sec) sec.classList.toggle('hidden', e.target.value !== 'combined');
        document.querySelectorAll('.radio-card').forEach(l => {
          const inp = l.querySelector('input[name="calc-method"]');
          if (inp) l.classList.toggle('selected', inp.checked);
        });
      });
    });

    document.querySelectorAll('input[name="neg-mode"]').forEach(r => {
      r.addEventListener('change', e => {
        Store.updateColony({ negativeDesireMode: e.target.value });
        const row = document.getElementById('neg-prio-row');
        if (row) row.classList.toggle('hidden', e.target.value !== 'lowest');
        document.querySelectorAll('.radio-card').forEach(l => {
          const inp = l.querySelector('input[name="neg-mode"]');
          if (inp) l.classList.toggle('selected', inp.checked);
        });
      });
    });

    const negSel = document.getElementById('neg-prio-select');
    if (negSel) negSel.addEventListener('change', e => {
      Store.updateColony({ negativeDesirePrio: Number(e.target.value) });
    });
  }

  if (tab === 'colonists') {
    document.getElementById('btn-add-colonist')?.addEventListener('click', () => {
      openPromptModal('Nom du colon', 'Nouveau colon', name => {
        Store.addColonist(name);
        renderTab('colonists');
      });
    });
  }

  if (tab === 'combat') {
    document.querySelectorAll('.combat-pct-input').forEach(inp => {
      inp.addEventListener('input', syncCombatInputs);
    });

    document.getElementById('btn-auto-assign')?.addEventListener('click', () => {
      const colony = Store.current();
      assignCombatRoles(colony);
      Store.updateColony({ colonists: colony.colonists });
      renderTab('combat');
    });

    document.querySelectorAll('.role-override').forEach(sel => {
      sel.addEventListener('change', e => {
        Store.updateColonist(e.target.dataset.col, { combatRole: e.target.value || null });
      });
    });
  }

  if (tab === 'schedules') {
    document.querySelectorAll('.schedule-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const sch   = cell.dataset.sch;
        const hour  = Number(cell.dataset.hour);
        const colony = Store.current();
        const cur   = colony.schedules[sch][hour];
        const next  = SCHEDULE_STATES[(SCHEDULE_STATES.indexOf(cur) + 1) % SCHEDULE_STATES.length];
        colony.schedules[sch][hour] = next;
        Store.updateColony({ schedules: colony.schedules });
        cell.textContent      = next;
        cell.style.background = SCHEDULE_STATE_COLORS[next];
        cell.title            = `${hour}h – ${SCHEDULE_STATE_LABELS[next]}`;
      });
    });

    document.getElementById('btn-auto-assign-schedules')?.addEventListener('click', () => {
      const colony = Store.current();
      if (!colony.colonists.length) return;
      autoAssignSchedules(colony);
      Store.updateColony({ colonists: colony.colonists });
      renderTab('schedules');
    });

    document.getElementById('btn-reset-schedules')?.addEventListener('click', () => {
      if (!confirm('Réinitialiser les deux plannings aux valeurs par défaut ?')) return;
      Store.updateColony({
        schedules: { A: [...DEFAULT_SCHEDULE_A], B: [...DEFAULT_SCHEDULE_B] }
      });
      renderTab('schedules');
    });
  }

  if (tab === 'priorities') {
    document.getElementById('btn-calc-priorities')?.addEventListener('click', () => {
      const colony = Store.current();
      recalculatePriorities(colony);
      Store.updateColony({ colonists: colony.colonists });
      renderTab('priorities');
    });

    document.getElementById('btn-reset-overrides')?.addEventListener('click', () => {
      const colony = Store.current();
      colony.colonists.forEach(c => {
        TASKS.forEach(t => { c.manualOverrides[t] = false; });
      });
      Store.updateColony({ colonists: colony.colonists });
      renderTab('priorities');
    });

    document.querySelectorAll('.prio-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const colId = cell.dataset.col;
        const task  = cell.dataset.task;
        const cur   = Number(cell.dataset.prio);
        const next  = (cur + 1) % 6;
        Store.updateColonist(colId, {
          taskPriorities:  { [task]: next },
          manualOverrides: { [task]: true }
        });
        cell.dataset.prio     = next;
        cell.textContent      = PRIORITY_LABELS[next];
        cell.style.background = PRIORITY_COLORS[next];
        cell.title            = `Priorité ${next} (modifié manuellement)`;
        cell.classList.add('manual');
      });
    });
  }
}

// ── Combat helpers ────────────────────────────────────────────────────────────

function syncCombatInputs() {
  const colony = Store.current();
  const pcts   = {};
  document.querySelectorAll('.combat-pct-input').forEach(inp => {
    pcts[inp.dataset.role] = Number(inp.value) || 0;
  });
  colony.combatRolePercents = pcts;
  Store.updateColony({ combatRolePercents: pcts });

  const n = colony.colonists.length;
  COMBAT_ROLES.forEach(r => {
    const count = Math.round((pcts[r.id] || 0) / 100 * n);
    const el    = document.getElementById(`rcount-${r.id}`);
    if (el) el.textContent = `~${count} colon${count !== 1 ? 's' : ''}`;
  });
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  content.innerHTML = html;
  overlay.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  _editingId = null;
}

function openPromptModal(label, defaultVal, callback) {
  openModal(`
    <h2>${esc(label)}</h2>
    <input id="prompt-input" type="text" value="${esc(defaultVal)}" class="input-field"
      onkeydown="if(event.key==='Enter')confirmPrompt()">
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
      <button class="btn btn-primary" onclick="confirmPrompt()">Confirmer</button>
    </div>`);
  document.getElementById('prompt-input')?.focus();
  window._promptCallback = callback;
}

function confirmPrompt() {
  const val = document.getElementById('prompt-input')?.value?.trim();
  closeModal();
  if (val && window._promptCallback) window._promptCallback(val);
  window._promptCallback = null;
}

// Close modal on overlay click or Escape
document.addEventListener('click', e => {
  if (e.target.id === 'modal-overlay') closeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

// ── Utilities ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
