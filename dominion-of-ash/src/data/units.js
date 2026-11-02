// Unit roster. Distances are world units (one hex is 2 wide); times in seconds.
// role drives AI and counters: melee | ranged | caster | flanker | swarm | hero
export const FACTIONS = {
  ember: { name: 'Emberlight', color: '#3f7fd0', tint: 0x6fa8ff },
  ash: { name: 'Ashen Legion', color: '#b3462f', tint: 0xff7a4d },
};

export const UNITS = {
  // ---------------- Emberlight ----------------
  knight: {
    loadout: { show: ['1H_Sword', 'Rectangle_Shield'] },
    faction: 'ember', name: 'Shieldknight', model: 'knight', role: 'melee', cost: 60,
    hp: 608, armor: 0.35, dmg: 22, rate: 1.1, range: 1.4, speed: 2.1, morale: 90, scale: 0.42,
    anims: { attack: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal'], idle: 'Idle_Combat' },
    ability: { id: 'shieldwall', name: 'Shield Wall', cd: 18, dur: 6, text: 'Take 65% less damage and hold ground for 6 s.' },
    blurb: 'Heavy infantry. Holds the line and screens archers.',
  },
  barbarian: {
    loadout: { show: ['2H_Axe'] },
    faction: 'ember', name: 'Ash-Breaker', model: 'barbarian', role: 'melee', cost: 70,
    hp: 538, armor: 0.15, dmg: 38, rate: 1.4, range: 1.5, speed: 2.4, morale: 80, scale: 0.43,
    anims: { attack: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'], idle: '2H_Melee_Idle' },
    ability: { id: 'cleave', name: 'Whirlwind', cd: 14, dur: 1.2, text: 'Spin and strike every enemy within reach.' },
    blurb: 'Shock trooper. Shatters skeleton packs, weak to arrows.',
  },
  ranger: {
    loadout: { show: ['2H_Crossbow'] },
    faction: 'ember', name: 'Ranger', model: 'rogue', role: 'ranged', cost: 55,
    hp: 327, armor: 0.05, dmg: 20, rate: 1.3, range: 9, speed: 2.4, morale: 65, scale: 0.4,
    anims: { attack: ['2H_Ranged_Shoot'], idle: 'Idle' }, projectile: 'arrow',
    ability: { id: 'volley', name: 'Volley', cd: 16, dur: 0, text: 'Loose three arrows at once.' },
    blurb: 'Crossbow skirmisher. Deadly from high ground, helpless up close.',
  },
  pyromancer: {
    loadout: { show: ['2H_Staff'] },
    faction: 'ember', name: 'Pyromancer', model: 'mage', role: 'caster', cost: 80,
    hp: 250, armor: 0, dmg: 13, rate: 1.8, range: 7.5, speed: 2.1, morale: 60, scale: 0.4,
    anims: { attack: ['Spellcast_Shoot'], idle: 'Idle' }, projectile: 'bolt',
    ability: { id: 'fireball', name: 'Fireball', cd: 18, dur: 0, radius: 2.1, dmg: 60, text: 'Hurl fire at a spot. Forests catch and spread.' },
    blurb: 'Burns clustered enemies and sets forests ablaze.',
  },
  shade: {
    loadout: { show: ['Knife', 'Knife_Offhand'] },
    faction: 'ember', name: 'Shade', model: 'rogue_hooded', role: 'flanker', cost: 65,
    hp: 351, armor: 0.1, dmg: 30, rate: 0.9, range: 1.3, speed: 3.4, morale: 70, scale: 0.4,
    anims: { attack: ['1H_Melee_Attack_Stab', '1H_Melee_Attack_Slice_Diagonal'], idle: 'Idle' },
    ability: { id: 'smoke', name: 'Smoke', cd: 20, dur: 5, text: 'Vanish for 5 s. The next strike from behind deals triple damage.' },
    blurb: 'Assassin. Strikes casters from behind.',
  },
  commander: {
    loadout: { show: ['1H_Sword', 'Badge_Shield'] },
    faction: 'ember', name: 'Lady Commander', model: 'knight', role: 'hero', cost: 0, hero: true,
    hp: 1216, armor: 0.3, dmg: 34, rate: 1.0, range: 1.5, speed: 2.4, morale: 999, scale: 0.52,
    anims: { attack: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Chop'], idle: 'Idle_Combat' },
    ability: { id: 'rally', name: 'Rally', cd: 24, dur: 6, radius: 6, text: 'Heal nearby allies and steady their nerve.' },
    blurb: 'Your general. If she falls, every soldier’s nerve falters.',
  },
  // ---------------- Ashen Legion ----------------
  bonewarden: {
    loadout: { attach: { r: 'Skeleton_Blade', l: 'Skeleton_Shield_Large_A' } },
    faction: 'ash', name: 'Bonewarden', model: 'skeleton_warrior', role: 'melee', cost: 60,
    hp: 561, armor: 0.3, dmg: 25, rate: 1.1, range: 1.4, speed: 2.0, morale: 999, scale: 0.42,
    anims: { attack: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal'], idle: 'Idle_Combat', walk: 'Walking_D_Skeletons' },
    ability: { id: 'shieldwall', name: 'Bone Wall', cd: 18, dur: 6, text: 'Brace and shrug off blows.' },
    blurb: 'Tireless line infantry. Never routs.',
  },
  thrall: {
    loadout: { attach: { r: 'Skeleton_Axe', l: 'Skeleton_Shield_Small_A' } },
    faction: 'ash', name: 'Thrall', model: 'skeleton_minion', role: 'swarm', cost: 30,
    hp: 222, armor: 0, dmg: 15, rate: 1.0, range: 1.3, speed: 2.6, morale: 999, scale: 0.36,
    anims: { attack: ['1H_Melee_Attack_Chop', '1H_Melee_Attack_Stab'], idle: 'Idle', walk: 'Walking_D_Skeletons' },
    blurb: 'Cheap and many. Necromancers raise more from the fallen.',
  },
  boneshot: {
    loadout: { attach: { r: 'Skeleton_Crossbow' } },
    faction: 'ash', name: 'Boneshot', model: 'skeleton_rogue', role: 'ranged', cost: 55,
    hp: 304, armor: 0.05, dmg: 21, rate: 1.4, range: 9.5, speed: 2.5, morale: 999, scale: 0.4,
    anims: { attack: ['2H_Ranged_Shoot'], idle: 'Idle' }, projectile: 'arrow',
    ability: { id: 'volley', name: 'Volley', cd: 16, dur: 0, text: 'Three bolts at once.' },
    blurb: 'Crossbow skeleton. Likes to flank through forests.',
  },
  necromancer: {
    loadout: { attach: { r: 'Skeleton_Staff' } },
    faction: 'ash', name: 'Necromancer', model: 'skeleton_mage', role: 'caster', cost: 85,
    hp: 280, armor: 0, dmg: 17, rate: 1.8, range: 7, speed: 2.0, morale: 999, scale: 0.4,
    anims: { attack: ['Spellcast_Shoot'], idle: 'Idle' }, projectile: 'bonebolt',
    ability: { id: 'raise', name: 'Raise Dead', cd: 16, dur: 0, radius: 7, text: 'Raise up to three fallen as thralls.' },
    blurb: 'Turns your losses into its army. Kill it first.',
  },
  ashking: {
    loadout: { attach: { r: 'Skeleton_Blade', l: 'Skeleton_Shield_Large_B' }, tint: 0x3a2a40 },
    faction: 'ash', name: 'The Ashen King', model: 'skeleton_warrior', role: 'hero', cost: 0, hero: true,
    hp: 1310, armor: 0.3, dmg: 40, rate: 1.1, range: 1.6, speed: 2.3, morale: 999, scale: 0.56,
    anims: { attack: ['2H_Melee_Attack_Spin', '1H_Melee_Attack_Chop'], idle: 'Idle_Combat', walk: 'Walking_D_Skeletons' },
    ability: { id: 'wail', name: 'Wail of Ash', cd: 22, dur: 6, radius: 7, text: 'Terrify the living: enemies nearby lose morale and deal less damage.' },
    blurb: 'Your nemesis. He remembers every battle.',
  },
};

export const ROSTER = {
  ember: ['knight', 'barbarian', 'ranger', 'pyromancer', 'shade'],
  ash: ['bonewarden', 'thrall', 'boneshot', 'necromancer'],
};
export const HERO = { ember: 'commander', ash: 'ashking' };
export const ROLES = ['melee', 'ranged', 'caster', 'flanker', 'swarm', 'hero'];
