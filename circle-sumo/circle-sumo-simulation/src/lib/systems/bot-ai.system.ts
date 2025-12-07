import { ECSSystem, EntitiesManager, IECSSystem } from '@lagless/core';
import { MathOps } from '@lagless/math';
import {
  Bot,
  BotFilter,
  CircleBody, GameState,
  PendingImpulse,
  SumoCharacterFilter,
  Transform2d,
  Velocity2d
} from '../schema/code-gen/index.js';
import { CircleSumoArena } from '../map.js';
import { PRNG } from '@lagless/core';

const NORMAL_COOLDOWN_MIN = 70;
const NORMAL_COOLDOWN_MAX = 100;
const PANIC_COOLDOWN_TICKS = 40;

const PANIC_COOLDOWN = 15;
const PANIC_REACTION_CHANCE = 0.25;

const PREDICTION_HORIZON_TICKS = 100;
const CAUTION_ZONE_RATIO = 0.95;

const DASH_INTENSITY_BASE = 0.40;
const DASH_INTENSITY_ATTACK = 0.70;
const DASH_INTENSITY_PANIC = 0.70;

@ECSSystem()
export class BotAISystem implements IECSSystem {
  constructor(
    private readonly _EntitiesManager: EntitiesManager,
    private readonly _BotFilter: BotFilter,
    private readonly _SumoCharacterFilter: SumoCharacterFilter,
    private readonly _Transform2d: Transform2d,
    private readonly _CircleBody: CircleBody,
    private readonly _Velocity2d: Velocity2d,
    private readonly _Bot: Bot,
    private readonly _PendingImpulse: PendingImpulse,
    private readonly _PRNG: PRNG,
    private readonly _GameState: GameState,
  ) {}

  public update(tick: number): void {
    if (this._GameState.safe.finishedAtTick !== 0) return;
    for (const botEntity of this._BotFilter) {
      // --- 1. Чтение состояния ---
      const transform = this._Transform2d.getCursor(botEntity);
      const velocity = this._Velocity2d.getCursor(botEntity);
      const body = this._CircleBody.getCursor(botEntity);
      const aggressiveness = this._Bot.unsafe.aggressiveness[botEntity];

      const bx = transform.positionX;
      const by = transform.positionY;
      const vx = velocity.velocityX;
      const vy = velocity.velocityY;

      const distSq = bx * bx + by * by;
      const distFromCenter = MathOps.sqrt(distSq);
      const arenaRadius = CircleSumoArena.radius;

      let radialOutX = 0, radialOutY = 0;
      if (distFromCenter > 0.001) {
        radialOutX = bx / distFromCenter;
        radialOutY = by / distFromCenter;
      }
      const toCenterX = -radialOutX;
      const toCenterY = -radialOutY;

      // --- 2. Анализ опасности и Прицеливание ---

      // Предсказание
      const predictedX = bx + vx * (PREDICTION_HORIZON_TICKS * 0.016);
      const predictedY = by + vy * (PREDICTION_HORIZON_TICKS * 0.016);
      const predictedDist = MathOps.sqrt(predictedX * predictedX + predictedY * predictedY);

      // Мы в опасности?
      const isInDanger = (predictedDist / arenaRadius) > CAUTION_ZONE_RATIO;

      let aimDirX = 0;
      let aimDirY = 0;
      let dashPower = DASH_INTENSITY_BASE;

      if (isInDanger) {
        // ПАНИКА: Спасаемся в центр
        aimDirX = toCenterX;
        aimDirY = toCenterY;
        dashPower = DASH_INTENSITY_PANIC;

        // Компенсация инерции (если летим наружу, сильнее гребем внутрь)
        aimDirX -= vx * 0.05;
        aimDirY -= vy * 0.05;
      } else {
        // АТАКА / ОЖИДАНИЕ
        const targetEntity = this.findBestTarget(botEntity, bx, by);

        if (targetEntity !== -1) {
          const tx = this._Transform2d.unsafe.positionX[targetEntity];
          const ty = this._Transform2d.unsafe.positionY[targetEntity];
          const dx = tx - bx;
          const dy = ty - by;
          const distToTarget = MathOps.sqrt(dx*dx + dy*dy);

          if (distToTarget > 0.001) {
            aimDirX = dx / distToTarget;
            aimDirY = dy / distToTarget;
          }
          dashPower = DASH_INTENSITY_ATTACK * (0.8 + aggressiveness * 0.4);
        } else {
          // Дрейф
          aimDirX = toCenterX;
          aimDirY = toCenterY;
          dashPower = DASH_INTENSITY_BASE * 0.5;
        }
      }

      // Safety Clamp: Не даем целиться наружу, если мы у края
      if (distFromCenter > arenaRadius * 0.85) {
        const dotRadial = aimDirX * radialOutX + aimDirY * radialOutY;
        if (dotRadial > 0) {
          aimDirX -= radialOutX * dotRadial;
          aimDirY -= radialOutY * dotRadial;
          aimDirX += toCenterX * 0.5;
          aimDirY += toCenterY * 0.5;
        }
      }

      // Нормализация вектора прицеливания
      const aimLenSq = aimDirX * aimDirX + aimDirY * aimDirY;
      if (aimLenSq > 0.001) {
        const l = MathOps.sqrt(aimLenSq);
        aimDirX /= l;
        aimDirY /= l;
      }

      // Визуализация: поворот
      if (aimLenSq > 0.001) {
        transform.rotation = MathOps.atan2(aimDirY, aimDirX);
      }

      // --- 3. Управление Кулдауном (INTERRUPT LOGIC) ---

      let nextTick = this._Bot.unsafe.nextDecisionTick[botEntity];

      if (isInDanger) {
        const ticksUntilAction = nextTick - tick;
        // Если ждать осталось больше, чем длится панический кулдаун,
        // значит мы можем "срезать" ожидание ради спасения.
        const ticksFromLastPanic = tick - this._Bot.unsafe.lastPanicTick[botEntity];
        if (ticksUntilAction > PANIC_COOLDOWN && ticksFromLastPanic >= PANIC_COOLDOWN_TICKS) {
          const roll = this._PRNG.getFloat53();
          if (roll < PANIC_REACTION_CHANCE) {
            nextTick = tick; // Действуем прямо сейчас!
            this._Bot.unsafe.nextDecisionTick[botEntity] = tick;
            this._Bot.unsafe.lastPanicTick[botEntity] = tick;
          }
        }
      }

      // --- 4. Действие ---
      if (tick >= nextTick) {
        // Применяем импульс
        const mass = body.mass;
        const finalImpulseX = aimDirX * dashPower * mass;
        const finalImpulseY = aimDirY * dashPower * mass;
        this.applyPendingImpulse(botEntity, finalImpulseX, finalImpulseY);

        // Устанавливаем НОВЫЙ кулдаун в зависимости от контекста
        let newCooldown = 0;

        // if (isInDanger) {
        //   // Если мы спасались, кулдаун короткий.
        //   // Это позволит сделать еще один рывок очень скоро, если первый не помог.
        //   newCooldown = PANIC_COOLDOWN;
        // } else {
        //   // Если это была обычная атака, отдыхаем долго.
        //   newCooldown = NORMAL_COOLDOWN_MIN +
        //     Math.floor(this._PRNG.getFloat53() * (NORMAL_COOLDOWN_MAX - NORMAL_COOLDOWN_MIN));
        // }

        newCooldown = NORMAL_COOLDOWN_MIN +
          Math.floor(this._PRNG.getFloat53() * (NORMAL_COOLDOWN_MAX - NORMAL_COOLDOWN_MIN));

        this._Bot.unsafe.nextDecisionTick[botEntity] = tick + newCooldown;
      }
    }
  }

  private findBestTarget(myEntity: number, myX: number, myY: number): number {
    let bestTarget = -1;
    let minScore = Number.MAX_VALUE;

    for (const otherEntity of this._SumoCharacterFilter) {
      if (otherEntity === myEntity) continue;
      if (!this._EntitiesManager.hasComponent(otherEntity, CircleBody)) continue;

      const tx = this._Transform2d.unsafe.positionX[otherEntity];
      const ty = this._Transform2d.unsafe.positionY[otherEntity];

      const dx = tx - myX;
      const dy = ty - myY;
      const distSq = dx * dx + dy * dy;

      if (distSq < minScore) {
        minScore = distSq;
        bestTarget = otherEntity;
      }
    }
    return bestTarget;
  }

  private applyPendingImpulse(entity: number, x: number, y: number): void {
    if (!this._EntitiesManager.hasComponent(entity, PendingImpulse)) {
      this._EntitiesManager.addComponent(entity, PendingImpulse);
      const pending = this._PendingImpulse.getCursor(entity);
      pending.impulseX = 0;
      pending.impulseY = 0;
    }
    const pending = this._PendingImpulse.getCursor(entity);
    pending.impulseX += x;
    pending.impulseY += y;
  }
}
