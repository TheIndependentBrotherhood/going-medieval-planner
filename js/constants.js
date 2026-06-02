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

// Tasks that train a specific skill (ordered by in-game priority)
const QUALIFYING_TASKS = [
  'Soigner',
  'Extraction',
  'Chasse',
  'Construction',
  'Pêche',
  'Croissance',
  'Récolte',
  'Élevage',
  'Coupe',
  'Cuisine',
  'Forge',
  'Menuiserie',
  'Confection',
  'Alchimie',
  'Recherche',
  'Artiste'
];

// Tasks with no associated skill
const NON_QUALIFYING_TASKS = [
  'Incendie',
  'Patient',
  'Convalescence',
  'Transport urgent',
  'Gardien',
  'Fabrication',
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
  T: '#c2570a',  // Travail    – orange
  S: '#1d4ed8',  // Sommeil    – bleu
  N: '#6b7280',  // N'importe  – gris
  L: '#b45309',  // Loisirs    – ambre
  F: '#16a34a'   // Fonctions de rôle – vert
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
  0: '#dc2626',  // forbidden – rouge vif
  1: '#16a34a',  // priorité 1 – vert vif
  2: '#059669',  // priorité 2 – vert émeraude
  3: '#d97706',  // priorité 3 – ambre
  4: '#ea580c',  // priorité 4 – orange
  5: '#6b7280'   // priorité 5 – gris
};

const PRIORITY_LABELS = {
  0: '🚫 0',
  1: '⭐ 1',
  2: '2',
  3: '3',
  4: '4',
  5: '5'
};

const SKILL_ICONS = {
  'Art':                'https://cdn-icons-png.flaticon.com/128/4401/4401807.png',
  'Botanique':          'https://cdn-icons-png.flaticon.com/128/16887/16887846.png',
  'Confection':         'https://cdn-icons-png.flaticon.com/128/3746/3746120.png',
  'Construction':       'https://cdn-icons-png.flaticon.com/128/7423/7423011.png',
  'Corps à corps':      'https://cdn-icons-png.flaticon.com/128/861/861891.png',
  'Cuisine':            'https://cdn-icons-png.flaticon.com/128/481/481486.png',
  'Discours':           'https://cdn-icons-png.flaticon.com/128/4726/4726351.png',
  "Dressage d'animaux": 'https://cdn-icons-png.flaticon.com/128/18713/18713953.png',
  'Extraction':         'https://cdn-icons-png.flaticon.com/128/1129/1129841.png',
  'Forge':              'https://cdn-icons-png.flaticon.com/128/7709/7709428.png',
  'Intellectuel':       'https://cdn-icons-png.flaticon.com/128/109/109827.png',
  'Médecine':           'https://cdn-icons-png.flaticon.com/128/10476/10476412.png',
  'Menuiserie':         'https://cdn-icons-png.flaticon.com/128/16238/16238159.png',
  'Tireur':             'https://cdn-icons-png.flaticon.com/128/1694/1694262.png'
};

const TASK_ICONS = {
  'Incendie':         'https://cdn-icons-png.flaticon.com/128/1633/1633308.png',
  'Patient':          'https://cdn-icons-png.flaticon.com/128/4348/4348820.png',
  'Soigner':          'https://cdn-icons-png.flaticon.com/128/2203/2203675.png',
  'Convalescence':    'https://cdn-icons-png.flaticon.com/128/3488/3488909.png',
  'Transport urgent': 'https://cdn-icons-png.flaticon.com/128/18961/18961582.png',
  'Gardien':          'https://cdn-icons-png.flaticon.com/128/265/265876.png',
  'Extraction':       'https://cdn-icons-png.flaticon.com/128/1129/1129841.png',
  'Chasse':           'https://cdn-icons-png.flaticon.com/128/17395/17395714.png',
  'Construction':     'https://cdn-icons-png.flaticon.com/128/7423/7423011.png',
  'Pêche':            'https://cdn-icons-png.flaticon.com/128/12967/12967285.png',

  'Croissance':       'https://cdn-icons-png.flaticon.com/128/2651/2651723.png',
  'Récolte':          'https://cdn-icons-png.flaticon.com/128/4337/4337502.png',
  'Élevage':          'https://cdn-icons-png.flaticon.com/128/2163/2163400.png',
  'Coupe':            'https://cdn-icons-png.flaticon.com/128/3856/3856178.png',
  'Cuisine':          'https://cdn-icons-png.flaticon.com/128/481/481486.png',
  'Fabrication':      'https://cdn-icons-png.flaticon.com/128/3204/3204996.png',
  'Forge':            'https://cdn-icons-png.flaticon.com/128/7709/7709428.png',
  'Menuiserie':       'https://cdn-icons-png.flaticon.com/128/16238/16238159.png',
  'Confection':       'https://cdn-icons-png.flaticon.com/128/3746/3746120.png',
  'Alchimie':         'https://cdn-icons-png.flaticon.com/128/4615/4615068.png',
  'Recherche':        'https://cdn-icons-png.flaticon.com/128/2224/2224395.png',
  'Artiste':          'https://cdn-icons-png.flaticon.com/128/8340/8340635.png',
  'Intendant':        'https://cdn-icons-png.flaticon.com/128/1071/1071329.png',
  'Formation':        'https://cdn-icons-png.flaticon.com/128/7634/7634775.png',
  'Transport':        'https://cdn-icons-png.flaticon.com/128/8820/8820735.png'
};

const COMBAT_ROLES = [
  { id: 'archer',         label: 'Archer',                   skill: 'Tireur',        defaultPct: 25 },
  { id: 'twoHanded',      label: 'Combattant 2 mains',       skill: 'Corps à corps', defaultPct: 30 },
  { id: 'oneHanded',      label: 'Combattant 1 main',        skill: 'Corps à corps', defaultPct:  5 },
  { id: 'oneHandedShield',label: 'Combattant 1 main + bouclier', skill: 'Corps à corps', defaultPct: 40 }
];
