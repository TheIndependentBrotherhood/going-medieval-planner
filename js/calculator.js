'use strict';

/**
 * Calculator — computes task priorities for every colonist in the active colony.
 *
 * Priority scale : 0 = forbidden, 1 = highest, 5 = lowest.
 *
 * Each task has a target distribution { high, mid, low } where:
 *   - high  colonists get priority 1 or 2 (best performers for the task)
 *   - mid   colonists get priority 3
 *   - low   colonists get priority 4 or 5 (worst performers)
 * Colonists are ranked by a blended desire/expertise/learning score, then
 * placed in bands according to that distribution.
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

/**
 * Map a 0-indexed position within a band to the priority range [prioMin, prioMax].
 * Distributes as evenly as possible (bottom-heavy within band).
 */
function bandToPrio(idx, bandSize, prioMin, prioMax) {
  if (prioMin === prioMax || bandSize <= 1) return prioMin;
  return Math.min(prioMax, Math.round(prioMin + (idx / (bandSize - 1)) * (prioMax - prioMin)));
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
  if (desire === 0) return 0;

  const { desire: wd, expertise: we, learning: wl } = weights;
  const total = wd + we + wl || 1;
  const blended = (desire * wd + expertise * we + learning * wl) / total;
  return Math.min(5, Math.max(1, Math.round(blended)));
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Compute a raw score for a colonist on a task (higher = better colonist for the task).
 * Returns -Infinity for forbidden colonists.
 */
function colonistScore(colony, colonist, task, expertiseMap, learningMap) {
  const method  = colony.calculationMethod;
  const weights = colony.methodWeights;

  const desirePrio = calcByDesire(colony, colonist, task);
  if (desirePrio === 0) return -Infinity; // forbidden

  const desireScore = 6 - desirePrio; // prio 1 → score 5, prio 3 → score 3, prio 5 → score 1

  if (method === 'desire') return desireScore;

  const expPrio = expertiseMap[colonist.id] ?? 3;
  const expScore = 6 - expPrio;

  const lrnPrio = learningMap[colonist.id] ?? 3;
  const lrnScore = 6 - lrnPrio;

  if (method === 'expertise') return expScore;
  if (method === 'learning')  return lrnScore;

  // combined
  const { desire: wd, expertise: we, learning: wl } = weights;
  const total = wd + we + wl || 1;
  return (desireScore * wd + expScore * we + lrnScore * wl) / total;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Recalculate task priorities for all colonists in the active colony.
 * Only updates tasks that are NOT manually overridden.
 *
 * For each task, colonists are ranked by their blended score and placed
 * in three priority bands according to the task's target distribution:
 *   high  → priority 1–2   (best performers)
 *   mid   → priority 3
 *   low   → priority 4–5   (worst performers)
 *
 * @param {object} colony - the full colony object
 */
function recalculatePriorities(colony) {
  const colonists   = colony.colonists;
  const forcedPrio  = colony.taskForcedPriority || {};
  const taskDist    = colony.taskDistribution || {};

  TASKS.forEach(task => {
    const isForced    = forcedPrio[task] != null;
    const expertiseMap = calcByExpertise(colony, task);
    const learningMap  = calcByLearning(colony, task);

    // ── Forced priority: everyone (except forbidden) gets the forced value ──
    if (isForced) {
      colonists.forEach(colonist => {
        if (colonist.manualOverrides[task]) return;
        if (ARCHER_ONLY_TASKS.includes(task) && colonist.combatRole !== 'archer') {
          colonist.taskPriorities[task] = 0;
          return;
        }
        const desirePrio = calcByDesire(colony, colonist, task);
        colonist.taskPriorities[task] = desirePrio === 0 ? 0 : forcedPrio[task];
      });
      return;
    }

    // ── Score every non-manual colonist ────────────────────────────────────
    const entries = colonists.map(colonist => {
      if (colonist.manualOverrides[task]) return { colonist, manual: true, score: 0 };

      // Archer-only tasks: forbidden for non-archers
      if (ARCHER_ONLY_TASKS.includes(task) && colonist.combatRole !== 'archer') {
        return { colonist, manual: false, score: -Infinity };
      }

      const score = colonistScore(colony, colonist, task, expertiseMap, learningMap);
      return { colonist, manual: false, score };
    });

    // Apply forbidden (score === -Infinity)
    entries.forEach(({ colonist, manual, score }) => {
      if (!manual && score === -Infinity) colonist.taskPriorities[task] = 0;
    });

    // Rank the eligible (non-forbidden, non-manual) colonists by score desc
    const rankable = entries
      .filter(e => !e.manual && e.score !== -Infinity)
      .sort((a, b) => b.score - a.score);

    // ── Apply band distribution ─────────────────────────────────────────────
    const raw    = taskDist[task] || { high: 0, mid: rankable.length, low: 0 };
    const avail  = rankable.length;
    const high   = Math.min(raw.high || 0, avail);
    const mid    = Math.min(raw.mid  || 0, avail - high);
    // Everyone beyond high+mid falls in the low band

    rankable.forEach((entry, i) => {
      let prio;
      if (i < high) {
        prio = bandToPrio(i, high, 1, 2);
      } else if (i < high + mid) {
        prio = 3;
      } else {
        const lowIdx   = i - high - mid;
        const lowCount = avail - high - mid;
        prio = bandToPrio(lowIdx, lowCount, 4, 5);
      }
      entry.colonist.taskPriorities[task] = prio;
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

  const raw = {
    archer:          (pcts.archer          / 100) * n,
    twoHanded:       (pcts.twoHanded       / 100) * n,
    oneHanded:       (pcts.oneHanded       / 100) * n,
    oneHandedShield: (pcts.oneHandedShield / 100) * n
  };

  const counts = {};
  let total = 0;
  COMBAT_ROLES.forEach(r => {
    counts[r.id] = Math.round(raw[r.id]);
    total += counts[r.id];
  });

  const diff = n - total;
  if (diff !== 0) {
    const largest = COMBAT_ROLES.reduce((a, b) => counts[a.id] > counts[b.id] ? a : b);
    counts[largest.id] += diff;
  }

  function score(colonist, roleId) {
    const role   = COMBAT_ROLES.find(r => r.id === roleId);
    const skill  = colonist.skills[role.skill] || 0;
    const desire = colonist.desires[role.skill] || 0;
    return skill + desire * 5;
  }

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

// ── Schedule auto-assignment ──────────────────────────────────────────────────

/**
 * Automatically distribute colonists between schedules A and B so that both
 * groups have a homogeneous skill profile.
 *
 * @param {object} colony - the full colony object (mutates colonist.schedule)
 */
function autoAssignSchedules(colony) {
  const colonists = colony.colonists;
  if (!colonists.length) return;

  function totalSkill(c) {
    return SKILLS.reduce((sum, s) => sum + (c.skills[s] || 0), 0);
  }

  const withTotals = colonists
    .map(c => ({ c, ts: totalSkill(c) }))
    .sort((a, b) => b.ts - a.ts);

  let scoreA = 0;
  let scoreB = 0;

  withTotals.forEach(({ c, ts }) => {
    if (scoreA <= scoreB) {
      c.schedule = 'A';
      scoreA += ts;
    } else {
      c.schedule = 'B';
      scoreB += ts;
    }
  });
}

// ── Schedule utilities ────────────────────────────────────────────────────────

/**
 * Check if any two colonists share at least one L or N slot across their schedules.
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

