/**
 * All tunables in one place. Units are SI: metres, seconds, kilograms, newtons.
 * World origin (0, 0) is the point the melon leaves your hands at the balcony
 * rail. +x runs downhill, away from the house. +y is up.
 */

export const PHYS = {
  /** Real gravity. Do not make this "fun". The fun comes from the air. */
  gravity: 9.81,
  /** Air density at 300m in the Berkeley hills on a warm afternoon. */
  airDensity: 1.225,
  /** Drag coefficient of a sphere at the Reynolds numbers a thrown melon sees. */
  dragCoefficient: 0.47,
  /**
   * Magnus (spin-lift) gain. The textbook lift coefficient for a smooth sphere
   * is about 0.5 * (r*omega / v), which for a hand-thrown melon produces a
   * deflection you can barely see. We multiply it so that spin is a control
   * surface you can actually steer with. This is the one dishonest number here.
   */
  magnusGain: 4.2,
  /** Spin bleeds off to air friction, per second. */
  spinDecay: 0.22,
  /** Fixed physics timestep. The sim substeps to hit this. */
  step: 1 / 240,
}

export const WIND = {
  /** Prevailing onshore breeze off the bay, blowing back toward the house. */
  baseSpeed: -2.4,
  /** Gusts wander around the base by this much. */
  gustAmplitude: 2.8,
  /** How fast the gust field evolves. */
  gustRate: 0.34,
  /**
   * Wind shear: it is calmer down in the pool grotto than up at rail height.
   * Multiplier at the pool, ramping to 1.0 at the balcony.
   */
  shelterAtPool: 0.25,
}

/** The hillside, in world metres. Derived from the reference photos. */
export const WORLD = {
  /** Where the melon leaves your hands. */
  throwPoint: { x: 0, y: 0 },
  /**
   * Top of the balcony rail, relative to the throw point. The rail sits just
   * above your hands, so anything flatter than about 19 degrees clips it —
   * that is the floor of the throwing corridor, with the eave as its ceiling.
   */
  railTop: 0.25,
  railX: 1.15,
  /** Ground level at the base of the house — three storeys below the balcony. */
  houseBaseY: -9.0,
  /** The house occupies x < houseFrontX. */
  houseFrontX: 1.15,

  pool: {
    /** Water surface height. 24 metres of air below the rail. */
    surfaceY: -24.0,
    left: 25.0,
    right: 34.0,
    /** Depth, for the underwater deceleration and the sunken-melon rendering. */
    depth: 2.6,
  },

  /** Coping/patio deck the pool is cut into. */
  patioY: -23.6,
  patioLeft: 23.4,
  patioRight: 37.0,

  /** Beyond the patio the hill drops again onto the neighbours' rooftops. */
  neighbourRoofY: -28.5,
  neighbourRoofLeft: 40.0,
  neighbourRoofRight: 58.0,
}

export const THROW = {
  /**
   * Two independent limits, as in a real throw. Below a crossover mass your
   * arm simply cannot swing any faster, so a Sugar Baby and a Crimson Sweet
   * leave your hand at the same speed. Above it you are limited by the impulse
   * you can deliver, and a Carolina Cross gets noticeably slower. Both limits
   * lift with strength, which is what the training is for.
   */
  baseImpulse: 52,
  impulsePerStrength: 6.6,
  armSpeedBase: 10.4,
  armSpeedPerStrength: 0.70,
  armSpeedCap: 24,
  /** Where everyone starts: a kid who has thrown a ball but not a melon. */
  startStrength: 3.5,
  /** Strength gained per clean rep in training. */
  strengthPerRep: 0.62,
  /** Seconds of wind-up to reach full power. */
  chargeTime: 1.15,
  /**
   * Past this fraction of a full charge your arm starts to shake and your aim
   * scatters. Holding a fully-loaded throw is a bad idea, which is the point.
   */
  steadyFraction: 0.72,
  /** Peak aim scatter in radians once you are shaking badly. */
  maxWobble: 0.085,
  /** Wrist flick -> spin, in melon rad/s per rad/s of drag-vector rotation. */
  spinGain: 7.5,
  maxSpin: 46,
  /**
   * Hold past this multiple of chargeTime and you fumble the melon entirely.
   * Power is already full at 1.0, so this is a full second and a half of dead
   * time past any reason to keep holding, and the ring warns throughout it.
   */
  fumbleAt: 2.3,
  /** Minimum drag, in screen pixels, before a throw counts as aimed. */
  minPull: 26,
}

export const MELONS = [
  { name: 'Sugar Baby', mass: 2.4, radius: 0.105, tint: '#2f5d34', score: 1.0 },
  { name: 'Crimson Sweet', mass: 5.2, radius: 0.138, tint: '#3c6b33', score: 1.35 },
  { name: 'Carolina Cross', mass: 8.6, radius: 0.175, tint: '#4a7538', score: 1.9 },
] as const

export type MelonKind = (typeof MELONS)[number]

export const SCORING = {
  /** Landing anywhere in the water. */
  splash: 100,
  /** Extra for hitting the middle of the pool, falling off toward the edges. */
  bullseye: 150,
  /** Steep entries make the good splash. Multiplier at a dead-vertical drop. */
  verticalBonus: 90,
  /** Per branch you glanced off and still made it. */
  trickBounce: 120,
  /** Per squirrel you passed within a whisker of without being robbed. */
  nearMiss: 80,
  /** Spin still on the melon at the moment of entry. */
  spinStyle: 3.2,
  /** The neighbours' roof. */
  roofPenalty: -200,
}

export const SQUIRREL = {
  /** How far out a squirrel notices an incoming melon. */
  alertRadius: 5.5,
  /** How far it can actually launch itself from the branch. */
  reach: 2.3,
  /** Airtime of a leap. */
  leapTime: 0.42,
  /** Grab radius while airborne. */
  grabRadius: 0.42,
  /**
   * A melon moving faster than this blows past before the squirrel's paws
   * close. Hard throws beat squirrels; lofted floaters get robbed.
   */
  maxCatchSpeed: 17.5,
  /** Seconds before a robbed squirrel returns to its branch. */
  respawn: 6.0,
}
