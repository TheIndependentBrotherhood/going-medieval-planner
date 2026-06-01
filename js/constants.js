'use strict';

const SKILLS = [
  'Art',
  'Botanique',
  'Confection',
  'Construction',
  'Corps à corps',
  'Cuisine',
  'Discours',
  "Dressage d'animaux",
  'Extraction',
  'Forge',
  'Intellectuel',
  'Médecine',
  'Menuiserie',
  'Tireur'
];

// Tasks ordered by in-game priority (left = highest precedence when same priority)
const TASKS = [
  'Incendie',
  'Patient',
  'Soigner',
  'Convalescence',
  'Transport urgent',
  'Gardien',
  'Extraction',
  'Chasse',
  'Construction',
  'Pêche',
  'Croissance',
  'Récolte',
  'Élevage',
  'Coupe',
  'Cuisine',
  'Fabrication',
  'Forge',
  'Menuiserie',
  'Confection',
  'Alchimie',
  'Recherche',
  'Artiste',
  'Intendant',
  'Formation',
  'Transport'
];

// Primary skill for each task (null = no specific skill required)
const TASK_SKILLS = {
  'Incendie':         null,
  'Patient':          null,
  'Soigner':          'Médecine',
  'Convalescence':    null,
  'Transport urgent': null,
  'Gardien':          null,
  'Extraction':       'Extraction',
  'Chasse':           'Tireur',           // archer only
  'Construction':     'Construction',
  'Pêche':            "Dressage d'animaux",
  'Croissance':       'Botanique',
  'Récolte':          'Botanique',
  'Élevage':          "Dressage d'animaux",
  'Coupe':            'Botanique',
  'Cuisine':          'Cuisine',
  'Fabrication':      null,
  'Forge':            'Forge',
  'Menuiserie':       'Menuiserie',
  'Confection':       'Confection',
  'Alchimie':         'Intellectuel',
  'Recherche':        'Intellectuel',
  'Artiste':          'Art',
  'Intendant':        null,
  'Formation':        null,               // uses both Tireur & Corps à corps
  'Transport':        null
};

// Formation uses both of these skills (special case)
const FORMATION_SKILLS = ['Tireur', 'Corps à corps'];

// Tasks that require being in a specific combat role
const ARCHER_ONLY_TASKS = ['Chasse'];

const SCHEDULE_STATES = ['T', 'S', 'N', 'L', 'F'];
const SCHEDULE_STATE_LABELS = {
  T: 'Travail',
  S: 'Sommeil',
  N: "N'importe",
  L: 'Loisirs',
  F: 'Fonctions de rôle'
};
const SCHEDULE_STATE_COLORS = {
  T: '#7c3d00',  // Travail    – orange
  S: '#1a3a6e',  // Sommeil    – bleu
  N: '#3a3a3a',  // N'importe  – gris
  L: '#6b5c00',  // Loisirs    – jaune
  F: '#1a5a2a'   // Fonctions de rôle – vert
};

const DEFAULT_SCHEDULE_A = ['S','S','S','T','T','T','T','S','S','S','S','L','L','N','N','N','N','T','T','T','T','L','L','S'];
const DEFAULT_SCHEDULE_B = ['T','T','T','S','S','S','S','T','T','T','T','L','L','N','N','N','N','T','T','T','T','L','L','T'];

const DESIRE_LABELS = {
  '-2': '😡 −2',
  '-1': '😟 −1',
   '0': '😐  0',
   '1': '😊 +1',
   '2': '😍 +2'
};

const CALC_METHODS = [
  { id: 'desire',    label: 'Envies',        desc: 'Priorités basées sur les envies du colon.' },
  { id: 'expertise', label: 'Expertise',     desc: 'Les meilleurs dans une compétence obtiennent les tâches associées.' },
  { id: 'learning',  label: 'Apprentissage', desc: 'Favorise les colons qui ont encore à apprendre.' },
  { id: 'combined',  label: 'Combiné',       desc: 'Pondère les trois méthodes selon vos préférences.' }
];

const PRIORITY_COLORS = {
  0: '#7f1d1d',  // forbidden – deep red
  1: '#14532d',  // top prio  – deep green
  2: '#166534',  // prio 2    – green
  3: '#713f12',  // prio 3    – amber
  4: '#7c2d12',  // prio 4    – orange
  5: '#374151'   // lowest    – gray
};

const PRIORITY_LABELS = {
  0: '🚫 0',
  1: '⭐ 1',
  2: '2',
  3: '3',
  4: '4',
  5: '5'
};

const COMBAT_ROLES = [
  { id: 'archer',         label: 'Archer',                   skill: 'Tireur',        defaultPct: 25 },
  { id: 'twoHanded',      label: 'Combattant 2 mains',       skill: 'Corps à corps', defaultPct: 30 },
  { id: 'oneHanded',      label: 'Combattant 1 main',        skill: 'Corps à corps', defaultPct:  5 },
  { id: 'oneHandedShield',label: 'Combattant 1 main + bouclier', skill: 'Corps à corps', defaultPct: 40 }
];
