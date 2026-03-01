import { CharacterControllerConfig, DEFAULT_CHARACTER_CONTROLLER_CONFIG } from '@lagless/character-controller-3d';

export interface ObstacleDef {
  readonly hx: number;
  readonly hy: number;
  readonly hz: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotX?: number;
}

export const ROBLOX_LIKE_CONFIG = {
  maxPlayers: 4,
  spawnY: 2,
  groundSize: 50,
  groundThickness: 0.1,
  hashReportInterval: 120,
} as const;

/** Static obstacles — must match visual meshes in babylon-scene. */
export const OBSTACLES: readonly ObstacleDef[] = [
  { hx: 2, hy: 1, hz: 2, x: 8, y: 1, z: 8 },
  { hx: 3, hy: 0.5, hz: 1, x: -5, y: 0.5, z: 10 },
  { hx: 1.5, hy: 1.5, hz: 1.5, x: -10, y: 1.5, z: -8 },
  { hx: 2, hy: 0.15, hz: 4, x: 0, y: 1.2, z: -10, rotX: -0.3 },
];

export const CHARACTER_CONFIG: CharacterControllerConfig = {
  ...DEFAULT_CHARACTER_CONTROLLER_CONFIG,
  walkSpeed: 16,
  runSpeed: 28,
  acceleration: 200,
  deceleration: 300,
  capsuleHalfHeight: 0.5,
  capsuleRadius: 0.3,
};
