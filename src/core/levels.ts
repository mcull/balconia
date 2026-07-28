export interface Level {
  name: string
  /** Shown on the training card before the round. */
  note: string
  squirrels: number
  /** 0 = leaps hopefully, 1 = computes intercepts. */
  squirrelSkill: number
  /** Multiplier on the prevailing wind. */
  wind: number
  /** Indices into MELONS the crate is stocked with. */
  crate: number[]
  /** Melons available this round. Infinity for the endless afternoon. */
  melons: number
  /** How many have to end up in the water. */
  quota: number
  /** Reps in the training session before this round. */
  reps: number
  exercise: 'pushup' | 'pullup' | 'curl' | 'row'
}

/**
 * The arc of the afternoon: first you learn the corridor between the rail and
 * the eave, then the squirrels start paying attention, then the wind comes up
 * off the bay, then you are strong enough to pick up something ridiculous.
 */
export const LEVELS: Level[] = [
  {
    name: 'First Afternoon',
    note: 'Over the rail, under the redwoods. Aim flat and let it fall.',
    squirrels: 0,
    squirrelSkill: 0,
    wind: 0.3,
    crate: [0, 1],
    melons: 6,
    quota: 2,
    reps: 5,
    exercise: 'pushup',
  },
  {
    name: 'The Redwoods Notice',
    note: 'Something up in the second redwood has been watching you.',
    squirrels: 2,
    squirrelSkill: 0.3,
    wind: 0.6,
    crate: [0, 1],
    melons: 7,
    quota: 3,
    reps: 6,
    exercise: 'pullup',
  },
  {
    name: 'Onshore',
    note: 'Wind off the bay, straight back into your face. Aim long.',
    squirrels: 3,
    squirrelSkill: 0.45,
    wind: 1.15,
    crate: [0, 1],
    melons: 7,
    quota: 3,
    reps: 6,
    exercise: 'row',
  },
  {
    name: 'Heavy Season',
    note: 'The Carolina Cross is in the crate. Eight and a half kilos.',
    squirrels: 3,
    squirrelSkill: 0.55,
    wind: 0.9,
    crate: [0, 1, 2],
    melons: 8,
    quota: 4,
    reps: 7,
    exercise: 'curl',
  },
  {
    name: 'The Oak',
    note: 'The old oak leans right out over the water. Thread it.',
    squirrels: 5,
    squirrelSkill: 0.7,
    wind: 1.35,
    crate: [0, 1, 2],
    melons: 8,
    quota: 4,
    reps: 7,
    exercise: 'pullup',
  },
  {
    name: 'Endless Afternoon',
    note: 'Nobody is calling you in. Throw until the light goes.',
    squirrels: 6,
    squirrelSkill: 0.8,
    wind: 1.2,
    crate: [0, 1, 2],
    melons: Infinity,
    quota: Infinity,
    reps: 8,
    exercise: 'curl',
  },
]

export const EXERCISE_NAMES: Record<Level['exercise'], string> = {
  pushup: 'Deck Push-Ups',
  pullup: 'Rafter Pull-Ups',
  curl: 'Watermelon Curls',
  row: 'Redwood Rows',
}
