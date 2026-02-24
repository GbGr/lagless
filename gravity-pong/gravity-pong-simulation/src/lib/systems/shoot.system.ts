import { ECSSystem, IECSSystem, InputProvider, PlayerResources } from '@lagless/core';
import { MathOps } from '@lagless/math';
import {
  Shoot, PlayerResource, MatchState,
  Ball, Velocity2d,
} from '../schema/code-gen/index.js';
import { GravityPongArena } from '../arena.js';

@ECSSystem()
export class ShootSystem implements IECSSystem {
  constructor(
    private readonly _InputProvider: InputProvider,
    private readonly _PlayerResources: PlayerResources,
    private readonly _MatchState: MatchState,
    private readonly _Ball: Ball,
    private readonly _Velocity2d: Velocity2d,
  ) {}

  public update(tick: number): void {
    if (this._MatchState.safe.phase !== 1) return;

    const A = GravityPongArena;
    const rpcs = this._InputProvider.collectTickRPCs(tick, Shoot);

    for (const rpc of rpcs) {
      const slot = rpc.meta.playerSlot;
      if (slot > 1) continue;
      const pr = this._PlayerResources.get(PlayerResource as any, slot)!;
      if (pr.safe.hasShot) continue;

      pr.safe.hasShot = 1;
      pr.safe.shootAngle = rpc.data.angle;
      pr.safe.shootPower = Math.max(A.minShootPower, Math.min(A.maxShootPower, rpc.data.power));
    }

    // Check if both connected players have shot or timeout
    const pr0 = this._PlayerResources.get(PlayerResource as any, 0)!;
    const pr1 = this._PlayerResources.get(PlayerResource as any, 1)!;
    const elapsed = tick - this._MatchState.safe.phaseStartTick;
    const timeout = elapsed >= A.aimPhaseTicks;

    const p0Ready = pr0.safe.hasShot === 1 || pr0.safe.connected === 0;
    const p1Ready = pr1.safe.hasShot === 1 || pr1.safe.connected === 0;
    const bothReady = p0Ready && p1Ready;

    if (!bothReady && !timeout) return;

    // Activate balls for players who shot
    for (let slot = 0; slot < 2; slot++) {
      const pr = this._PlayerResources.get(PlayerResource as any, slot)!;
      if (pr.safe.connected === 0 && pr.safe.hasShot === 0) {
        // Mark ball as resolved immediately for disconnected non-shooters
        this._MatchState.safe.ballsResolved = this._MatchState.safe.ballsResolved | (1 << slot);
        continue;
      }

      const ballEntity = pr.safe.ballEntity;
      if (pr.safe.hasShot === 1) {
        const angle = pr.safe.shootAngle;
        const power = pr.safe.shootPower;
        const vx = MathOps.cos(angle) * power;
        const vy = MathOps.sin(angle) * power;

        this._Ball.unsafe.active[ballEntity] = 1;
        this._Velocity2d.unsafe.velocityX[ballEntity] = vx;
        this._Velocity2d.unsafe.velocityY[ballEntity] = vy;
      } else {
        // Didn't shoot before timeout — resolve ball
        this._MatchState.safe.ballsResolved = this._MatchState.safe.ballsResolved | (1 << slot);
      }
    }

    // Transition to flight phase
    this._MatchState.safe.phase = 2;
    this._MatchState.safe.phaseStartTick = tick;
  }
}
