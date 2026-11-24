# REPLICA

> It is not animated. It is watching.

A 2-D platform-fighter where you duel a mirror of yourself — an opponent whose brain is a
small convolutional neural network that learns *your* patterns and quietly punishes them.

**This build is Milestone 1 of the plan: graphics, sprites, animations and the duel loop.**
Everything you see and do is real and hand-authored; the CNN is not wired in yet (see
[What's next](#whats-next)).

---

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Other commands:

```bash
npm run typecheck    # tsc --noEmit, strict
npm test             # 43 physics / combat / animation assertions
npm run smoke        # boots the real game entry under a DOM shim, 240 frames
npm run build        # typecheck + production bundle
npm run shots        # headless render of the live pipeline -> out/crops/
```

## Controls

| Input | Action |
|---|---|
| `A` / `D` or `←` / `→` | Move |
| `W` / `Space` / `↑` | Jump (hold for height, tap for a hop) |
| `S` / `↓` + jump | Drop through a platform |
| `1` `2` `3` `4` `5` | Sword · Bolt · Aegis · Chain · Phase |
| `Esc` / `P` | Pause |
| `R` | Restart the generation |

---

## What's in this build

### Fighters
Vector sprite rigs — no image assets, everything is drawn from a 19-channel pose vector
through a joint solver. Both fighters share the kit, which is the point: your opponent is a
mirror.

- **14 hand-authored poses**, blended by eased keyframe tracks
- **Procedural locomotion**: idle breathing and weight shift, a two-phase run cycle,
  rise/fall air poses, landing squash
- **Foot planting** so nothing floats: the support foot is solved to the floor line each frame
- **One-shot overlays** layered over locomotion: slash wind-up → cut, cast wind-up → release,
  guard, hurt, phase, death collapse
- Layered armour with tapered limb geometry, joint plates, pauldron, swept helmet crest,
  emissive visor, animated scarf strands and a shoulder mantle

### Five weapons, all animated and functional
| # | Weapon | Behaviour |
|---|---|---|
| 1 | **Sword Strike** | Committed melee arc; whiffs leave you open |
| 2 | **Magic Bolt** | Travelling projectile, sub-stepped so it can't tunnel |
| 3 | **Aegis** | Parry ward; a successful parry *reflects* the bolt at 125 % |
| 4 | **Chain Lightning** | 0.9 s telegraphed pillar at your predicted landing spot |
| 5 | **Phase Shift** | Blink through attacks, short-hop if the destination is blocked |

### Arena
Fixed three-tier stage — floor, two side shelves (one jump up), a high central lintel
(only reachable from a shelf). Every surface is a one-way platform with drop-through, so
jumping and falling are whole parts of the vocabulary.

- **Six hidden trap tiles** buried in the floor and shelves, only a hairline seam visible:
  Spike Vent, Flare Jet, Snare, Gravity Well, Collapse, Hex Plate
- **Symmetric by construction**: whichever fighter steps on a live tile eats it. There is a
  test that asserts identical kind and damage for both.
- **Three armed per generation**, layout reshuffles whenever the replica reforms
- Status effects are real: root, control inversion, gravity pull, launch
- Brazier practicals, wet-slab sheen, parallax skyline, aurora ribbons, drifting fog, embers

### Presentation
- Renders into a half-resolution buffer and **upscales with a real screen-space bloom pass**,
  so blades, bolts and seams glow — and it costs almost nothing
- Hit-stop, screen shake, slow motion on death, impact bursts, slash arcs, chain lightning
  bolts, phase trails, parry flashes
- HUD: HP plates, weapon rack with cooldown meters, portraits, generation counter
- Continuous generation loop: fight → one side shatters → reform → new trap layout

---

## What's next

Per `PLAN.md`, Milestone 2 is the brain:

1. Hand-written tensor/CNN with gradient-checked backprop
2. 12-step input window, 21 channels, three softmax heads (weapon / lateral / jump)
3. Live on-device training from your inputs, session-scoped, bootstrapped on synthetic personas
4. The replica's policy: read → pre-dodge → punish, with the fairness governor
5. Headless accuracy harness (target ≥ 65 % held-out vs 20 % chance)

The current opponent is a scripted sparring partner so the animation work can be tested
against something that fights back. It is not the CNN.

---

## Layout

```
src/
  main.ts              boot, fixed-step loop, bloom composite, generation loop
  game/
    physics.ts         gravity, jump, coyote time, buffers, one-way platforms
    weapons.ts         data-driven weapon table
    duel.ts            hitboxes, projectiles, parry, impacts, replica sparring AI
    traps.ts           six trap kinds, symmetric triggering, status effects
    input.ts           keyboard mapping
  gfx/
    character.ts       rig solver + armoured sprite renderer
    anim.ts            poses, overlays, locomotion blending
    arena.ts           stage, traps, VFX primitives, backdrop
    render-duel.ts     scene assembly, HUD, screens
    ctx.ts             palette + canvas environment interface (headless-safe)
    particles.ts       pooled particle system
    math.ts            easing, damping, deterministic RNG
scripts/               headless QA: smoke test, bloom filmstrip, test bundling
tests/                 physics, combat, trap symmetry, animation invariants
```

Zero runtime dependencies. Vite + TypeScript, Canvas 2D, no network calls, no assets.
