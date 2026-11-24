# REPLICA — v3 (locked)

> *A 2-D arena. A jump button. Floor that isn't always floor. And something learning you.*

Continuous 1v1 duel in a side-view platform arena against a mirror of yourself: a genuinely
trained CNN that learns **your** movement, jumps and weapon choices, predicts what you
will do next, and quietly punishes you for it. It does this while you fight. It never
tells you what it knows. **Status: design v3 — all decisions locked, nothing built yet.**

---

## 1. Decisions locked (from your answers)

| Topic | Your call | Effect on design |
|---|---|---|
| View | **2-D arena with jumps + hidden traps** | Side-view platform arena; gravity, one-way platforms, air control; rigged tiles baked into the arena |
| Difficulty | **Fair rival with caps** | Trust governor, reaction floor, dodge budget — dangerous but always beatable |
| Reveal | **Completely secret — you never see it** | No prediction UI, no accuracy, no telemetry, no analysis screen, no debug overlay in the player build |
| Memory | **Session only** | Brain lives in memory for the whole session, across fights; reload = fresh brain. No saves |
| Perspective | **Side-view platformer** | Three tiers, gravity, drop-throughs; the closest, most legible read-baiting |
| Traps | **Symmetric + baitable** | Hurts whoever steps on it; nothing is player-only; baiting the replica onto a tile is a real tactic |
| Arena rotation | **New trap layout each generation** | Rigged tiles reshuffle whenever the replica reforms; platform shape stays fixed for mastery |
| HUD | **HP + weapon pips + generation tally** | Small generation counter visible during play; nothing else about the brain |

---

## 2. The loop

Fight → one side shatters → ~1.5 s → next fight, immediately. No menus between rounds.
The replica keeps everything it learned about you during the session. Lose and it returns
slightly sharper. Win and it reforms a little colder — same brain, new stance.
Your only visible progress is how long you last, and how many times you put it down.

Everything the replica is thinking stays inside its head: no numbers, no labels, no tells
beyond how it physically moves.

---

## 3. The arena

Fixed 1280×720 stage, camera locked, crisp silhouettes.

- **Floor** at y≈640, **two raised platforms** (left and right, mid-height), **one high
  central ledge** — a small three-tier geometry that makes vertical play matter.
- Fighters ≈ 46×74, walk 260 px/s, gravity 2200 px/s², jump ≈ 780 px/s (≈ 0.7 s airtime,
  ≈ 135 px height), full air control, variable jump height on early release, 90 ms coyote
  time, 100 ms jump buffer. One jump — no double jump. Phase Shift is your air mobility.
- One-way platforms you can drop through with ↓ + jump. Falling off the stage is not
  possible; walls bound the arena.

### Hidden traps — built into the arena

The floor and platforms hide **six rigged tiles**. Three are armed per generation. Nothing
marks them except a hairline seam a careful eye can catch; they do not glow, count down, or
announce themselves. They trigger when a fighter *steps on them* — either fighter. That is
the whole point.

| Trap | Effect | Tell once triggered | Re-arm |
|---|---|---|---|
| **Spike Vent** | 14 dmg, launches upward | 0.30 s floor rattle, then spikes | 7 s |
| **Flare Jet** | 10 dmg, horizontal flame wall, 240 px | 0.35 s heat shimmer | 7 s |
| **Snare** | roots you 0.65 s, no damage | floor lock, seam lights | 6 s |
| **Gravity Well** | 1.2 s pull toward tile, breaks jumps | soft distortion ring | 8 s |
| **Collapse** | tile drops out for 2 s | dust, then gap | 9 s |
| **Hex Plate** | swaps your facing and inverts controls 1 s | magenta seam pulse | 8 s |

Rules:
- Once triggered, a tile stays faintly **revealed for that generation** — so the map
  becomes learned by *eating it* or by watching the replica get caught.
- Trap layouts **rotate when the replica reforms** (new generation), so no layout is ever
  truly memorised.
- The replica is part of the arena's system and therefore knows where the armed tiles are.
  It will **herd** you toward them using your predicted movement. This is its home-field
  advantage — and the fairness governor caps how hard it can exploit it.
- Every trap can hit either fighter. Bait the replica's dodge onto a live tile and watch it
  eat its own floor.

---

## 4. Weapons (five, shared kit)

The replica wields exactly the same five. That is what makes it a mirror.

| # | Weapon | Range / shape | Wind-up | Damage | Cooldown | Role |
|---|---|---|---|---|---|---|
| 1 | **Sword Strike** | 130×110 arc in facing dir, hits air | 0.16 s | 16 | 0.55 s | Closest-range punish; whiff = 0.35 s open |
| 2 | **Magic Bolt** | projectile, jumps/ducks over it | 0.12 s | 9 | 0.45 s | Zoning; reflectable at 150 % |
| 3 | **Aegis** | 0.30 s parry window all around | instant | negate + 8 riposte | 1.6 s | First 0.12 s = perfect: reflects bolts |
| 4 | **Chain Lightning** | rune at predicted spot, full-height column | 0.90 s telegraph | 14 | 2.2 s | Can't be jumped — must move laterally. Most learnable move |
| 5 | **Phase Shift** | 170 px blink in facing dir, air OK | 0.05 s | 0 | 2.4 s | Dodge through anything, reposition; leaves a 0.4 s afterimage |

Controls: `A`/`D` or `←`/`→` move · `W`/`Space` jump · `S`/`↓` drop through · `1`–`5`
weapons · `Esc` pause. Touch buttons as a stretch.

Design intent: the vertical axis gives the replica two dodges (step or jump), which means
predicting *the weapon* isn't enough — it has to predict **which evasion you leave open**.
That is the game.

---

## 5. The secret CNN

Real, small, and actually trained on your inputs during play. No fake "AI" animations.

### Representation
Rolling window of your last **12 decisions**, each encoded as **21 channels**:

- relative x bucket (5) · relative y bucket (3) · on-ground (2)
- lateral input (3) · jump input (2) · weapon one-hot incl. *none* (6)
- nearest armed-trap proximity (3) · facing (2)

A `1 × 21 × 12` tensor — your behaviour as a thin strip of "spectrogram".

### Network
```
Conv1D 21→32, k=3, same, ReLU
Conv1D 32→32, k=3, same, ReLU      (≈ 39 k params total)
Flatten (384) → Dense 96, ReLU
├── weapon head   6-way softmax   (none + five weapons)
├── lateral head  3-way softmax   (left / hold / right)
└── jump head     2-way softmax
```
Outputs are *your next input*, committed after a **130 ms reaction floor** — the replica
cannot act on a prediction the human couldn't have reacted to.

### Learning
- Loss `CE(weapon) + 0.5·CE(lateral) + 0.5·CE(jump)`; Adam (1e-3, cosine decay).
- One mini-batch of 24 sampled from a 1 536-decision replay buffer, at most every 200 ms,
  time-sliced so a 60 fps frame is never starved. Strict label discipline: the window only
  contains pre-decision inputs; the label is the next input.
- Class-balanced sampling + entropy floor so a weird playstyle can't starve the model.
- Session lifetime: trained continuously, survives every death/reform, dies on reload.

### Bootstrapping
A brand-new brain spends ~3 seconds training on three synthetic personas — rusher, zoner,
jumper — so fight one is already a real opponent, not a punching bag. Then it becomes you.

### Fairness governor
Trust starts at 0.45 and ramps to a 0.78 cap over ~90 s of engagement. Reaction floor 130 ms,
max 4 successful evasions per 10 s, and every failed read leaves it genuinely open. It gets sharper the longer you
survive — never unfair.

### Validation (dev-only, never in the player build)
`npm run sim` plays scripted personas headlessly and prints held-out next-input accuracy.
Acceptance before polish: **≥ 65 % accuracy** on a repeatable human-like policy vs 20 %
chance, plus gradient checks on every hand-written backward pass. This is how I prove the
learning is real without showing the player anything.

---

## 6. How it fights

Every ~100 ms it reads the window and reacts to the predicted next input:

| It predicts… | It does… |
|---|---|
| Sword | backstep **or** jump over the arc, then riposte into your whiff |
| Bolt | jump it, Phase through it, or Aegis-reflect into your face |
| Chain | pre-emptively walks off the rune, then pressures your recovery |
| Aegis | refuses to feed the parry; repositions, herding you toward a trap |
| Phase Shift | aims at the **landing point**, not your current position |
| Jump | punishes the landing (the most exploitable 0.2 s in the game) |
| Trap trigger | shoulders you toward it; chain-lightnings the escape side (situational, trust-gated) |

Attack choice = distance + your recovery state + its confidence, gated by cooldowns. When
its read is bad it plays cautious and probes; when it's good it feels surgical. The only
signals it gives are physical: a half-step of anticipation, a jump that starts a frame early,
a stance that leans away. Nothing else.

---

## 7. Secrecy & interface

- **HUD:** HP bars, weapon-ready pips, and a small generation tally. Nothing about the brain.
- Generation tally counts reforms this session only; nothing survives a reload.
- **No accuracy, no confidence, no prediction display, no analysis screen, no debug overlay,
  no console output** in the player build.
- Death screen: the fight outcome, no numbers about *how* it read you. Its behaviour is the
  only evidence, and that is exactly what makes it creepy.
- The dev harness lives in `scripts/` and is never reachable from the game UI.

---

## 8. Tech

Vite + TypeScript, **zero runtime dependencies, zero network calls**. Rendering: Canvas 2D.
Audio: synthesised WebAudio (no asset files). State: none in storage — the brain is
in-memory only. The CNN is hand-written tensor/layer/Adam code (checked in, tested,
~400 lines). Target: solid 60 fps, 1 280×720, window-scaled, keyboard-first.

---

## 9. Folder & module breakdown (build-ready)

```
src/game/
  arena.ts        stage geometry, one-way platforms, drop-through, walls
  traps.ts        6 trap types, armed-tile set per generation, symmetric triggers
  physics.ts      gravity 2200 px/s², jump 780 px/s, coyote 90 ms, buffer 100 ms
  weapons.ts      data-driven table: wind-up, range, damage, cooldown, i-frames
  combat.ts       hitboxes, parry/reflect, knockback, hit-stop, death
  replica.ts      policy: prediction → evade → punish, herding, trust governor
  generations.ts  session loop, reform, trap reshuffle, minimal death screen
  render.ts       arena, traps seams, fighters, weapons VFX, particles, camera shake
  audio.ts        synthesised whoosh / zap / crack / parry chime / drone
src/ai/
  tensor.ts       1-D/2-D views over Float32Array
  cnn.ts          Conv1D, Dense, softmax, Adam, hand-written backward passes
  features.ts     21-channel decision encoding, 12-step window
  replay.ts       1 536-sample ring buffer, class-balanced sampling
  policy.ts       read → counter table, reaction floor, dodge budget
scripts/sim.ts    headless persona benchmark, accuracy report (dev only)
tests/            gradient checks, convergence, trap symmetry, combat rules
```

No module is allowed to reach into another's internals; the AI only ever consumes
`features.ts` output and public fighter state, never internal cooldowns of the player.

---

## 10. Milestones

1. **Arena** — platforms, jump feel, five weapons, traps, damage, death. Fun with a dummy.
2. **Brain** — tensor/CNN/training + gradient checks + `npm run sim` ≥ 65 %.
3. **Mirror** — prediction-driven dodges and punishes, herding, fairness governor, tells.
4. **Loop** — endless generations, session memory, silent reform, minimal death screen.
5. **Feel** — juice, synth audio, balancing, accessibility, pause.
6. **Verify** — typecheck, tests, production build, live preview, README.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Replica unbeatable | fairness governor, reaction floor, dodge budget, whiff vulnerability |
| CNN silently not learning | dev-only accuracy harness before any polish |
| Traps feel unfair | subtle but perceptible seams, permanent reveal per generation, both fighters affected |
| Player feels cheated | every dodge is animated and paid for; prediction always leaves it vulnerable |
| Frame hitches from on-device training | time-sliced training, small model, hard per-frame budget |
| 2-D jump feel | coyote time, jump buffer, variable height — tuned in milestone 1 |

---

## 12. Acceptance criteria (definition of done)

- Five weapons all deal damage, all have a counter, none is spam-safe.
- Jumps feel crisp: coyote time, buffer, variable height measured and tuned.
- Six trap types live; symmetric damage proven by test; seams visible but subtle.
- Brain trains on-device from your inputs; dev harness reports **≥ 65 % held-out
  next-input accuracy** on a human-like persona (chance = 20 %).
- Replica dodges and punishes based on predictions only (no peeked cooldowns), governed by
  trust cap 0.78, 130 ms reaction floor, 4 dodges / 10 s.
- Session loop endless, no stall, generations counted, trap layout reshuffles on reform.
- Absolutely no brain state surfaced to the player build.
- `npm run typecheck`, `npm test`, `npm run build` all clean; live preview works.

---

## 13. Remaining choices (not blocking — I'll assume the bolded defaults)

1. **Browser game (recommended)** vs downloadable desktop build.
2. Audio on, **starting quiet** — and a mute key.
3. **Skip a tutorial; teach through a silent first fight** vs a one-screen controls card.
4. Name: **REPLICA** (working title).
