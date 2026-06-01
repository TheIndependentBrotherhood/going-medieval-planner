'use strict';

/**
 * Calculator — computes task priorities for every colonist in the active colony.
 *
 * Priority scale : 0 = forbidden, 1 = highest, 5 = lowest.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map a desire value (-2…+2) to a raw priority (1…5 or 0). */
function desireToPriority(desire, mode, fallbackPrio) {
  switch (desire) {
    case  2: return 1;
    case  1: return 2;
    case  0: return 3;
    case -1: return mode === 'forbid' ? 0 : fallbackPrio;
    case -2: return 0;
    default: return 3;
  }
}

/** Rank colonists by a numeric value (desc). Returns a map id→rank (1 = best). */
function rankDesc(colonists, valueFn) {
  const scored = colonists.map(c => ({ id: c.id, val: valueFn(c) }));
  scored.sort((a, b) => b.val - a.val);
  const ranks = {};
  scored.forEach((item, i) => { ranks[item.id] = i; }); // 0-indexed rank
  return ranks;
}

/**
 * Convert a 0-indexed rank among N colonists to a priority 1-5.
 * The top colonist gets prio 1, the bottom prio 5.
 */
function rankToPriority(rank, total) {
  if (total <= 1) return 1;
  // Map rank [0, total-1] → priority [1, 5]
  return Math.round(1 + (rank / (total - 1)) * 4);
}

/** Average skill for a colonist across multiple skill names. */
function avgSkill(colonist, skillNames) {
  const vals = skillNames.map(s => colonist.skills[s] || 0);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Positive desire for Formation: archer desire OR melee desire. */
function formationDesire(colonist) {
  const d1 = colonist.desires['Tireur'] || 0;
  const d2 = colonist.desires['Corps à corps'] || 0;
  return Math.max(d1, d2);
}

// ── Per-method calculators ────────────────────────────────────────────────────

/**
 * Desire method: directly maps desires to priorities.
 */
function calcByDesire(colony, colonist, task) {
  const skill = TASK_SKILLS[task];

  if (task === 'Formation') {
    const d = formationDesire(colonist);
    return desireToPriority(d, colony.negativeDesireMode, colony.negativeDesirePrio);
  }

  if (!skill) return 3; // neutral for no-skill tasks

  const desire = colonist.desires[skill] || 0;
  return desireToPriority(desire, colony.negativeDesireMode, colony.negativeDesirePrio);
}

/**
 * Expertise method: best skilled colonist in a task's skill gets prio 1.
 */
function calcByExpertise(colony, task) {
  const colonists = colony.colonists;
  const n = colonists.length;
  if (!n) return {};

  let valueFn;
  if (task === 'Formation') {
    valueFn = c => avgSkill(c, FORMATION_SKILLS);
  } else {
    const skill = TASK_SKILLS[task];
    if (!skill) {
      // No skill → all get neutral
      const result = {};
      colonists.forEach(c => { result[c.id] = 3; });
      return result;
    }
    valueFn = c => c.skills[skill] || 0;
  }

  const ranks = rankDesc(colonists, valueFn);
  const result = {};
  colonists.forEach(c => {
    result[c.id] = rankToPriority(ranks[c.id], n);
  });
  return result;
}

/**
 * Learning method: colonists below average in a skill get better prio
 * (to let them learn), while experts get lower prio on that task.
 */
function calcByLearning(colony, task) {
  const colonists = colony.colonists;
  const n = colonists.length;
  if (!n) return {};

  let getLevel;
  if (task === 'Formation') {
    getLevel = c => avgSkill(c, FORMATION_SKILLS);
  } else {
    const skill = TASK_SKILLS[task];
    if (!skill) {
      const result = {};
      colonists.forEach(c => { result[c.id] = 3; });
      return result;
    }
    getLevel = c => c.skills[skill] || 0;
  }

  const levels   = colonists.map(getLevel);
  const avg      = levels.reduce((a, b) => a + b, 0) / (n || 1);
  // Rank ascending (lowest skill = wants to learn most → best prio = lower number)
  const scored   = colonists.map(c => ({ id: c.id, val: getLevel(c) }));
  scored.sort((a, b) => a.val - b.val); // ascending = below avg first

  const result = {};
  scored.forEach((item, i) => {
    result[item.id] = rankToPriority(i, n);
  });
  return result;
}

// ── Weight blending ───────────────────────────────────────────────────────────

/**
 * Blend desire + expertise + learning into a single priority [1..5].
 * Never overrides 0 (forbidden) coming from a negative desire.
 */
function blendPriorities(desire, expertise, learning, weights) {
  // If desire method says forbidden (0), respect it
  if (desire === 0) return 0;

  const { desire: wd, expertise: we, learning: wl } = weights;
  const total = wd + we + wl || 1;
  const blended = (desire * wd + expertise * we + learning * wl) / total;
  return Math.min(5, Math.max(1, Math.round(blended)));
}

// ── Task-weight adjustment ────────────────────────────────────────────────────

/**
 * Shift a priority by task importance weight (1..5 → high weight = shift toward 1).
 * taskWeight is 1 (critical) … 5 (unimportant).
 */
function applyTaskWeight(priority, taskWeight) {
  if (priority === 0) return 0; // forbidden stays forbidden
  // Center weight is 3; shift priority by (3 - taskWeight)
  const shift  = 3 - taskWeight;  // negative = push up (more important), positive = push down
  const result = priority - shift; // subtract shift to move priority toward 1 if important
  return Math.min(5, Math.max(1, Math.round(result)));
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Recalculate task priorities for all colonists in the active colony.
 * Only updates tasks that are NOT manually overridden.
 *
 * @param {object} colony - the full colony object
 */
function recalculatePriorities(colony) {
  const method   = colony.calculationMethod;
  const weights  = colony.methodWeights;
  const colonists = colony.colonists;

  TASKS.forEach(task => {
    // Pre-compute expertise + learning maps for this task (colony-wide)
    const expertiseMap = calcByExpertise(colony, task);
    const learningMap  = calcByLearning(colony, task);

    colonists.forEach(colonist => {
      // Skip manually overridden tasks
      if (colonist.manualOverrides[task]) return;

      // Chasse (Hunting): forbidden for non-archers
      if (ARCHER_ONLY_TASKS.includes(task) && colonist.combatRole !== 'archer') {
        colonist.taskPriorities[task] = 0;
        return;
      }

      let priority;

      if (method === 'desire') {
        priority = calcByDesire(colony, colonist, task);
      } else if (method === 'expertise') {
        const exp = expertiseMap[colonist.id] ?? 3;
        // Still respect forbidden desires
        const d   = calcByDesire(colony, colonist, task);
        priority  = d === 0 ? 0 : exp;
      } else if (method === 'learning') {
        const lrn = learningMap[colonist.id] ?? 3;
        const d   = calcByDesire(colony, colonist, task);
        priority  = d === 0 ? 0 : lrn;
      } else {
        // combined
        const d   = calcByDesire(colony, colonist, task);
        const exp = expertiseMap[colonist.id] ?? 3;
        const lrn = learningMap[colonist.id] ?? 3;
        priority  = blendPriorities(d, exp, lrn, weights);
      }

      // Apply task importance weight
      const taskWeight = colony.taskWeights[task] || 3;
      priority = applyTaskWeight(priority, taskWeight);

      colonist.taskPriorities[task] = priority;
    });
  });
}

// ── Combat role auto-assignment ───────────────────────────────────────────────

/**
 * Automatically distribute combat roles among colonists based on skill and desire,
 * respecting the colony's percentage settings.
 */
function assignCombatRoles(colony) {
  const colonists = colony.colonists;
  const n = colonists.length;
  if (!n) return;

  const pcts = colony.combatRolePercents;

  // Calculate how many colonists per role (rounded, must sum to n)
  const raw = {
    archer:          (pcts.archer          / 100) * n,
    twoHanded:       (pcts.twoHanded       / 100) * n,
    oneHanded:       (pcts.oneHanded       / 100) * n,
    oneHandedShield: (pcts.oneHandedShield / 100) * n
  };

  // Round and fix remainder
  const counts = {};
  let total = 0;
  COMBAT_ROLES.forEach(r => {
    counts[r.id] = Math.round(raw[r.id]);
    total += counts[r.id];
  });

  // Adjust rounding errors on the biggest group
  const diff = n - total;
  if (diff !== 0) {
    const largest = COMBAT_ROLES.reduce((a, b) => counts[a.id] > counts[b.id] ? a : b);
    counts[largest.id] += diff;
  }

  // Score colonists for each role
  function score(colonist, roleId) {
    const role   = COMBAT_ROLES.find(r => r.id === roleId);
    const skill  = colonist.skills[role.skill] || 0;
    const desire = colonist.desires[role.skill] || 0;
    // Archers also need positive Tireur desire; melee need Corps à corps
    return skill + desire * 5; // desire is more important than raw skill
  }

  // Greedy assignment: archers first (because Chasse depends on it)
  const assigned = new Set();
  const result   = {};

  ['archer', 'twoHanded', 'oneHanded', 'oneHandedShield'].forEach(roleId => {
    const available = colonists
      .filter(c => !assigned.has(c.id))
      .map(c => ({ c, s: score(c, roleId) }))
      .sort((a, b) => b.s - a.s);

    for (let i = 0; i < counts[roleId] && i < available.length; i++) {
      assigned.add(available[i].c.id);
      result[available[i].c.id] = roleId;
    }
  });

  colonists.forEach(c => {
    c.combatRole = result[c.id] || null;
  });
}

// ── Schedule utilities ────────────────────────────────────────────────────────

/**
 * Check if any two colonists share at least one L or N slot across their schedules.
 * Returns false if there are no common social slots (warning case).
 */
function hasCommonLeisure(colony) {
  const colonists = colony.colonists;
  if (colonists.length < 2) return true;

  for (let i = 0; i < colonists.length; i++) {
    for (let j = i + 1; j < colonists.length; j++) {
      const schA = colony.schedules[colonists[i].schedule];
      const schB = colony.schedules[colonists[j].schedule];
      for (let h = 0; h < 24; h++) {
        if ((schA[h] === 'L' || schA[h] === 'N') &&
            (schB[h] === 'L' || schB[h] === 'N')) {
          return true;
        }
      }
    }
  }
  return false;
}
