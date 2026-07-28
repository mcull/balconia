/**
 * Late-afternoon in the Berkeley hills: hazy backlit blue over the bay, warm
 * redwood in the foreground, everything a little bleached toward the horizon.
 */
export const PAL = {
  skyHigh: '#5f9cc4',
  skyMid: '#8fbdd8',
  skyHaze: '#d8dfdc',
  horizonWarm: '#f0e6d0',

  sun: '#fff3d6',
  sunGlow: 'rgba(255, 232, 186, 0.55)',

  bayFar: '#aec6cf',
  bayNear: '#93b3c0',
  islands: '#8d9aa0',
  farHills: '#9aa7a6',

  flatsHaze: '#c9d0c8',
  flatsRoof: '#b4b2a8',

  foliageFar: '#7d9b78',
  foliageMid: '#4f6f4a',
  foliageNear: '#38543a',
  foliageDeep: '#25392a',
  foliageRim: '#c8d98a',

  barkLight: '#7a5340',
  barkDark: '#402b21',

  soil: '#5b4433',
  soilShadow: '#3a2a1f',

  deck: '#9a5e42',
  deckShade: '#6d3f2d',
  deckLine: '#4c2b1f',
  houseWall: '#6b4436',
  houseTrim: '#f4efe6',
  glass: '#3f4a4c',

  poolLight: '#63c6c0',
  poolDeep: '#1f7f8c',
  poolFoam: '#f2fbf9',
  coping: '#c2705a',
  patio: '#b98a6d',

  melonSkin: '#4a7538',
  melonStripe: '#20401f',
  melonFlesh: '#e05b6a',
  melonRind: '#eaf3d8',

  squirrel: '#9a6b45',
  squirrelBelly: '#e2c8a8',

  ink: '#241d18',
  paper: '#efe6d4',
} as const

/** Warm sunlight comes in low from the west, out over the bay. */
export const SUN = { x: 0.86, y: 0.5 }
