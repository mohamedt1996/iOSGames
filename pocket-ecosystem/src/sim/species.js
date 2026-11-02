// Species definitions. Ranges are "comfort" windows; outside them plants lose health.
// moist: soil moisture 0..1, light: daily-averaged light 0..1, nut: nutrient need per growth unit.
export const PLANT = { NONE: 0, MOSS: 1, GRASS: 2, FERN: 3, BLOOM: 4, MUSHROOM: 5, DEWTRAP: 6, ALGAE: 7 };

export const PLANTS = {
  [PLANT.MOSS]: {
    key: 'moss', name: 'Cushion Moss', color: 0x5d8a3a,
    moist: [0.4, 1.0], dryMargin: 0.3, light: [0.08, 0.55], growth: 0.9, spread: 0.55, nut: 0.15,
    drown: 0.035, heatMax: 31, tall: 0, maxAge: 9999, edible: 1,
    blurb: 'Loves damp, shaded soil. Burns in strong sun when dry. Food for snails; nursery for firefly larvae.',
  },
  [PLANT.GRASS]: {
    key: 'grass', name: 'Hair Grass', color: 0x7fa846,
    moist: [0.25, 0.75], light: [0.35, 1.0], growth: 1.1, spread: 0.45, nut: 0.35,
    drown: 0.025, heatMax: 36, tall: 0.25, maxAge: 9999, edible: 0.6,
    blurb: 'Sun-hungry and quick. Drinks hard and strips nutrients from the soil.',
  },
  [PLANT.FERN]: {
    key: 'fern', name: 'Button Fern', color: 0x3f7a35,
    moist: [0.45, 0.92], light: [0.18, 0.7], growth: 0.45, spread: 0.12, nut: 0.4,
    drown: 0.03, heatMax: 32, tall: 1, maxAge: 9999, edible: 0.15,
    blurb: 'Slow and tall. Its fronds cast shade that cools the soil and shelters moss.',
  },
  [PLANT.BLOOM]: {
    key: 'bloom', name: 'Starbloom', color: 0xe9a3c9,
    moist: [0.3, 0.7], light: [0.45, 1.0], growth: 0.7, spread: 0.08, nut: 0.6,
    drown: 0.02, heatMax: 34, tall: 0.5, maxAge: 9999, edible: 0.3, matureAge: 1.2,
    blurb: 'Blooms after a day of bright, fed life. Nectar sustains fireflies; spent flowers scatter seed.',
  },
  [PLANT.MUSHROOM]: {
    key: 'mushroom', name: 'Glowcap', color: 0xd9c7a0,
    moist: [0.55, 1.0], light: [0.0, 0.3], growth: 1.0, spread: 0.3, nut: 0, needsDet: true,
    drown: 0.04, heatMax: 32, tall: 0.2, maxAge: 5, edible: 0.4,
    blurb: 'Feeds on rot in the dark. Turns dead matter into rich soil, then fades.',
  },
  [PLANT.DEWTRAP]: {
    key: 'dewtrap', name: 'Dewtrap', color: 0xb8433c,
    moist: [0.5, 1.0], light: [0.4, 1.0], growth: 0.35, spread: 0.05, nut: 0,
    drown: 0.03, heatMax: 33, tall: 0.15, maxAge: 9999, edible: 0, carnivore: true,
    blurb: 'Thrives in poor soil. Its sticky leaves catch gnats — and careless fireflies.',
  },
  [PLANT.ALGAE]: {
    key: 'algae', name: 'Pond Algae', color: 0x4f9a5a,
    moist: [0, 1], light: [0.2, 1.0], growth: 1.4, spread: 0.6, nut: 0.25, aquatic: true,
    drown: 99, heatMax: 34, tall: 0, maxAge: 9999, edible: 0.5,
    blurb: 'Lives only in standing water. Oxygenates by day, chokes the pond at night if it runs wild.',
  },
};

export const CRE = { SNAIL: 'snail', PILLBUG: 'pillbug', FIREFLY: 'firefly', GNAT: 'gnat', FROG: 'frog' };

export const CREATURES = {
  snail: {
    name: 'Garden Snail', speed: 0.035, flier: false, life: 14, eats: 'plants', diet: [1, 2, 7],
    breedEnergy: 0.85, breedAge: 1.2, hatch: 1.5, cap: 12, o2: 1.0, breedRate: 0.6,
    blurb: 'Grazes moss and grass. Seals itself in when the air turns dry. Its droppings feed the soil.',
  },
  pillbug: {
    name: 'Pill Bug', speed: 0.06, flier: false, life: 12, eats: 'detritus',
    breedEnergy: 0.75, breedAge: 0.8, hatch: 0.8, cap: 18, o2: 0.6,
    blurb: 'The cleanup crew. Eats rot and returns it to the soil as nutrients.',
  },
  firefly: {
    name: 'Firefly', speed: 0.22, flier: true, life: 7, eats: 'nectar',
    breedEnergy: 0.75, breedAge: 1.0, hatch: 1.5, cap: 24, o2: 0.5,
    blurb: 'Nocturnal. Drinks Starbloom nectar and lays eggs in moss. Glows when content.',
  },
  gnat: {
    name: 'Fungus Gnat', speed: 0.3, flier: true, life: 3, eats: 'detritus',
    breedEnergy: 0.6, breedAge: 0.4, hatch: 0.6, cap: 40, o2: 0.2, breedRate: 0.8,
    blurb: 'A pest born from rot. Swarms when dead matter piles up.',
  },
  frog: {
    name: 'Pebble Frog', speed: 0.12, flier: false, life: 40, eats: 'insects',
    breedEnergy: 2, breedAge: 99, hatch: 99, cap: 2, o2: 3.0,
    blurb: 'Needs a pond and a steady supply of gnats. The crown of a balanced jar.',
  },
};

export const plural = (n) => (/[^aeiou]y$/.test(n) ? n.slice(0, -1) + 'ies' : n + 's');
