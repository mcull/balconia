# Balconia

Throw watermelons off the top-floor balcony of a Berkeley hills house and try to
land them in the pool, three storeys down at the bottom of the slope.

Runs in a browser. No engine, no art assets, no audio files — the hillside, the
squirrels and the splash are all drawn and synthesised at runtime.

```bash
npm install
npm run dev
```

## Playing

**Drag back, hold, and flick.** One gesture with three axes:

| what you do | what it sets |
| --- | --- |
| the direction you drag | your line — it is a slingshot, pull back and down to throw out and up |
| how long you hold | power, which ramps on its own; you are choosing a moment, not a distance |
| how you curl your wrist as you let go | spin — backspin floats the melon out over the trees, topspin drops it short and steep |

Aim reads a *smoothed* version of your drag while spin reads the instantaneous
rotation rate, so a flick at the last instant adds spin without throwing your
line away. Hold past about three quarters of a full wind-up and your arm starts
to shake; hold much longer than that and you drop the melon on the deck.

Keyboard: `←` `→` aim, `Q` `E` spin, hold `SPACE`, `1`–`3` pick a melon, `M` mute.

## What makes a throw hard

- **The rail.** It sits just above your hands, so anything flatter than about
  19° clips it. That is the floor of the corridor.
- **The wind.** An onshore breeze off the bay pushes back toward the house,
  gusting, and it is calmer down in the pool grotto than up at rail height. It
  moves the landing point by about 4 m — against a 9 m pool.
- **The canopy.** Melons punch through the outer branches at a cost in speed
  and a kick sideways; the thick inner limbs near a trunk stop one dead.
- **The squirrels.** They live in the redwoods, watch the sky, and leap at
  anything passing within reach.

## The three melons

Your arm has two independent limits — the impulse you can deliver, and how fast
it can physically swing. Below a crossover mass the swing speed binds, above it
the impulse does. Everything else falls out of that:

| | mass | behaviour |
| --- | --- | --- |
| Sugar Baby | 2.4 kg | same release speed as the Crimson but more drag per kilo, so it actually flies *shorter*. Small and quick — squirrels almost never get one. |
| Crimson Sweet | 5.2 kg | the workhorse, sitting right on the crossover. |
| Carolina Cross | 8.6 kg | needs a serious arm to move at all, and it is big and slow enough that squirrels eat it. Worth 1.9×. |

Measured against the shipped physics, at maximum difficulty: full-power throws
get stolen 0 out of 12 times, lofted ones 6 out of 12. Sugar Babies get stolen 0
out of 12, Carolina Crosses 7 out of 12. None of that is scripted — it falls out
of mass, radius and release speed.

## The exercises

You start too weak to reach the pool. Before each round there is a short
rhythm set — push-ups on the deck, pull-ups on the rafter, watermelon curls —
and each clean rep raises both of your arm's limits. A perfect set is worth a
bonus rep.

The progression is the point: early on you throw as hard as you possibly can and
still come up short, and by the end full power sails over the neighbours' roof
and the game becomes about *throttling*.

## Physics

Real gravity, real air. Quadratic drag against the relative wind, and a Magnus
term for spin whose lift coefficient rises with the spin ratio and saturates,
the way a real sphere's does. Integrated with velocity Verlet, substepped at
240 Hz so a fast melon cannot tunnel through a branch.

The one dishonest number is `PHYS.magnusGain`. Textbook Magnus lift on a
hand-thrown melon is a deflection you can barely see; it is multiplied by 4.2 so
that spin is a control surface you can actually steer with. It is commented as
such in `src/core/config.ts`, where every tunable lives.

Underwater there is buoyancy too — a watermelon is very slightly denser than
water, so a good one plunges, stalls, and wallows back up to sit half submerged.

## Layout

```
src/
  core/      config, world geometry, physics, squirrels, levels, game loop
  render/    camera, painterly helpers, scene, actors, particles, HUD
  audio/     runtime-synthesised sound
  ui/        the training minigame
```

`src/core/config.ts` holds every tunable in SI units. The world origin is the
point the melon leaves your hands; `+x` runs downhill, `+y` is up.

In dev builds the game instance is exposed as `window.game`, which is how the
balance numbers above were measured — drive `update()` by hand and the whole
thing is deterministic.
