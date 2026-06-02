'use strict';

const STORAGE_KEY = 'gm_planner_saves';
const ACTIVE_KEY  = 'gm_planner_active';

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ── Default builders ──────────────────────────────────────────────────────────

function defaultTaskWeights() {
  const w = {};
  TASKS.forEach(t => { w[t] = 3; });
  return w;
}

function defaultColonist(name = 'Nouveau colon') {
  const skills   = {};
  const desires  = {};
  SKILLS.forEach(s => { skills[s] = 0; desires[s] = 0; });

  const taskPriorities = {};
  const manualOverrides = {};
  TASKS.forEach(t => { taskPriorities[t] = 3; manualOverrides[t] = false; });

  return {
    id:              uid(),
    name,
    schedule:        'A',
    combatRole:      null,
    skills,
    desires,
    taskPriorities,
    manualOverrides
  };
}

function defaultColony(name = 'Ma Colonie') {
  return {
    id:         uid(),
    name,
    colonists:  [],
    combatRolePercents: {
      archer:          25,
      twoHanded:       30,
      oneHanded:        5,
      oneHandedShield: 40
    },
    schedules: {
      A: [...DEFAULT_SCHEDULE_A],
      B: [...DEFAULT_SCHEDULE_B]
    },
    taskWeights:            defaultTaskWeights(),
    calculationMethod:      'combined',
    methodWeights:          { desire: 40, expertise: 40, learning: 20 },
    negativeDesireMode:     'forbid',  // 'forbid' | 'lowest'
    negativeDesirePrio:     5,
    positiveDesireBonus:    true,
    maxColonistsPerTaskPct: 50         // % max de colons pouvant avoir priorité 1 par tâche
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

const Store = (() => {
  let _saves  = {};   // { colonyId: colony }
  let _active = null; // colonyId

  function _persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_saves));
    localStorage.setItem(ACTIVE_KEY,  _active || '');
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      _saves = raw ? JSON.parse(raw) : {};
    } catch (_) { _saves = {}; }

    _active = localStorage.getItem(ACTIVE_KEY) || null;

    // Ensure at least one colony exists
    if (Object.keys(_saves).length === 0) {
      const colony = defaultColony();
      _saves[colony.id] = colony;
      _active = colony.id;
      _persist();
    } else if (!_saves[_active]) {
      _active = Object.keys(_saves)[0];
      _persist();
    }
  }

  function current() {
    return _saves[_active];
  }

  function allSaves() {
    return Object.values(_saves).map(c => ({ id: c.id, name: c.name }));
  }

  function switchTo(id) {
    if (_saves[id]) {
      _active = id;
      _persist();
    }
  }

  function createColony(name) {
    const colony = defaultColony(name || 'Nouvelle Colonie');
    _saves[colony.id] = colony;
    _active = colony.id;
    _persist();
    return colony;
  }

  function deleteColony(id) {
    if (Object.keys(_saves).length <= 1) return false; // keep at least one
    delete _saves[id];
    if (_active === id) {
      _active = Object.keys(_saves)[0];
    }
    _persist();
    return true;
  }

  function updateColony(patch) {
    Object.assign(_saves[_active], patch);
    _persist();
  }

  function addColonist(name) {
    const c = defaultColonist(name);
    _saves[_active].colonists.push(c);
    _persist();
    return c;
  }

  function updateColonist(id, patch) {
    const col = _saves[_active].colonists.find(c => c.id === id);
    if (col) {
      // Deep-merge skill/desire/priority sub-objects
      ['skills', 'desires', 'taskPriorities', 'manualOverrides'].forEach(key => {
        if (patch[key]) Object.assign(col[key], patch[key]);
      });
      // Merge top-level scalar fields
      ['name', 'schedule', 'combatRole'].forEach(key => {
        if (key in patch) col[key] = patch[key];
      });
      _persist();
    }
  }

  function removeColonist(id) {
    const colony = _saves[_active];
    colony.colonists = colony.colonists.filter(c => c.id !== id);
    _persist();
  }

  function getColonist(id) {
    return _saves[_active].colonists.find(c => c.id === id) || null;
  }

  return {
    load, current, allSaves, switchTo,
    createColony, deleteColony, updateColony,
    addColonist, updateColonist, removeColonist, getColonist,
    defaultColonist
  };
})();
