import type { WeaponId } from '../gfx/character';

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  /** total animation length in seconds */
  duration: number;
  /** when the hit/effect fires */
  hitAt: number;
  cooldown: number;
  damage: number;
  range: number;
  color: string;
  desc: string;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  1: {
    id: 1,
    name: 'SWORD',
    duration: 0.52,
    hitAt: 0.17,
    cooldown: 0.55,
    damage: 16,
    range: 132,
    color: '#9ef7ef',
    desc: 'Committed melee arc. Whiff leaves you open.',
  },
  2: {
    id: 2,
    name: 'BOLT',
    duration: 0.46,
    hitAt: 0.15,
    cooldown: 0.45,
    damage: 9,
    range: 760,
    color: '#8fe9ff',
    desc: 'Projectile. Jump it or parry it back.',
  },
  3: {
    id: 3,
    name: 'AEGIS',
    duration: 0.3,
    hitAt: 0.02,
    cooldown: 1.6,
    damage: 8,
    range: 74,
    color: '#ffd98a',
    desc: 'Parry ward. Perfect parry reflects bolts.',
  },
  4: {
    id: 4,
    name: 'CHAIN',
    duration: 1.2,
    hitAt: 0.9,
    cooldown: 2.2,
    damage: 14,
    range: 96,
    color: '#b9a6ff',
    desc: 'Telegraphed pillar. Cannot be jumped.',
  },
  5: {
    id: 5,
    name: 'PHASE',
    duration: 0.36,
    hitAt: 0.05,
    cooldown: 2.4,
    damage: 0,
    range: 170,
    color: '#ffb3e6',
    desc: 'Blink through anything. Reposition and bait.',
  },
};

export const WEAPON_ORDER: WeaponId[] = [1, 2, 3, 4, 5];
