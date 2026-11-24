/** Headless interactive-play fixture: drives a scripted player + sim against the duel. */
import { Duel, type BufferedInput } from '../src/game/duel';
import { checkTraps, rollLayout, applyTrapEvent } from '../src/game/traps';
import { TRAP_SEAMS } from '../src/gfx/arena';
import { makePoseState, renderDuel, syncPose, type FighterPoseState } from '../src/gfx/render-duel';
import type { WeaponId } from '../src/gfx/character';

export class PlayFixture {
  duel = new Duel({ seed: 4242 });
  traps = rollLayout(TRAP_SEAMS, 0x5eed);
  player: FighterPoseState = makePoseState('player', 320, 620, 1);
  replica: FighterPoseState = makePoseState('replica', 960, 620, -1);
  t = 0;
  script: Array<{ at: number; fn: () => void }> = [];
  weapon: WeaponId = 1;

  reset(seed = 4242): void {
    this.duel = new Duel({ seed });
    this.traps = rollLayout(TRAP_SEAMS, 0x5eed);
    this.player = makePoseState('player', 320, 620, 1);
    this.replica = makePoseState('replica', 960, 620, -1);
    this.t = 0;
  }

  at(at: number, fn: () => void): this {
    this.script.push({ at, fn });
    return this;
  }

  step(dt: number, input: Partial<BufferedInput> = {}): void {
    const buffered: BufferedInput = { move: 0, jumpPressed: false, jumpHeld: false, down: false, weapon: null, ...input };
    this.t += dt;
    while (this.script.length && this.t >= this.script[0].at) {
      const s = this.script.shift()!;
      s.fn();
    }
    this.duel.update(dt, buffered);
    const ev = checkTraps(this.traps, { player: this.duel.player, replica: this.duel.replica }, dt);
    for (const e of ev.events) {
      const victim = e.victim === 'player' ? this.duel.player : this.duel.replica;
      applyTrapEvent(e, victim);
    }
    this.player.overlay = this.duel.overlay.player ? { ...this.duel.overlay.player } : null;
    this.replica.overlay = this.duel.overlay.replica ? { ...this.duel.overlay.replica } : null;
    this.player.charge = this.duel.charge.player;
    this.replica.charge = this.duel.charge.replica;
    this.player.guard = this.duel.guard.player;
    this.replica.guard = this.duel.guard.replica;
    this.player.hurt = this.duel.hurt.player;
    this.replica.hurt = this.duel.hurt.replica;
    this.player.ghost = this.duel.ghost.player;
    this.replica.ghost = this.duel.ghost.replica;
    this.player.weapon = this.weapon;
    this.replica.weapon = this.duel.lastWeapon.replica;
    syncPose(this.player, this.duel.player, dt);
    syncPose(this.replica, this.duel.replica, dt);
  }

  render(ctx: unknown): void {
    renderDuel(ctx as never, {
      duel: this.duel,
      player: this.player,
      replica: this.replica,
      traps: this.traps,
      time: this.t,
      generation: 1,
      titleIn: 1,
      paused: false,
      hint: 1,
      arenaFlash: 0,
    });
  }
}
