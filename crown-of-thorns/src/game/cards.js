// Cards. kind: threat = aimed at another house's province from an adjacent one of yours (all threats look the
// same face-down: a march, a feint or a raid cannot be told apart until the reveal); self = on your own province
// (hold, ambush, levy... also look alike face-down); spy = peeks at a face-down card; instant = resolves now.
export const CARDS = {
  march: { name: 'March', kind: 'threat', cost: 3, icon: 'swords', text: 'Send all but one soldier from a province within two hexes to take the target.' },
  feint: { name: 'Feint', kind: 'threat', cost: 2, icon: 'mask', text: 'Looks exactly like a March. Does nothing, except make them waste their defence.' },
  raid: { name: 'Raid', kind: 'threat', cost: 3, icon: 'torch', text: 'Steal 3 gold from the target’s house unless the province is held.' },
  siege: { name: 'Siege', kind: 'threat', cost: 6, icon: 'ram', text: 'A March that ignores walls.' },
  hold: { name: 'Hold', kind: 'self', cost: 2, icon: 'shield', text: '+4 defence here this round, and walls count double.' },
  ambush: { name: 'Ambush', kind: 'self', cost: 4, icon: 'dagger', text: 'If this province is attacked, the attackers lose 4 soldiers before the battle.' },
  levy: { name: 'Levy', kind: 'self', cost: 3, icon: 'banner', text: '+2 soldiers here (+3 in a castle or town).' },
  fortify: { name: 'Fortify', kind: 'self', cost: 4, icon: 'tower', text: 'Build a wall here (max 3). Each wall adds 1 defence.' },
  rally: { name: 'Rally', kind: 'self', cost: 3, icon: 'horn', text: 'Bring all but one soldier from your adjacent provinces here, after battles.' },
  harvest: { name: 'Harvest', kind: 'self', cost: 2, icon: 'wheat', text: '+3 gold (+5 if this is a farm or mine).' },
  spy: { name: 'Spy', kind: 'spy', cost: 3, icon: 'eye', text: 'Secretly look at one face-down card already placed.' },
  plague: { name: 'Plague', kind: 'threat', cost: 7, icon: 'skull', text: 'Half the soldiers in the target province die. Reveals as hostile.' },
};
export const STARTER = ['march', 'march', 'march', 'march', 'feint', 'feint', 'hold', 'hold', 'levy', 'levy', 'harvest', 'spy'];
export const MARKET_POOL = ['march', 'march', 'feint', 'feint', 'raid', 'raid', 'siege', 'hold', 'hold', 'ambush', 'ambush', 'levy', 'levy', 'fortify', 'fortify', 'rally', 'rally', 'harvest', 'spy', 'spy', 'plague'];
export const THREATS = ['march', 'feint', 'raid', 'siege', 'plague'];
export const HOSTILE = ['march', 'raid', 'siege', 'plague'];
