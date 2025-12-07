// ===== File: src/components/vfx/useVFXContainer.ts =====

import { useCallback, useEffect, useRef } from 'react';
import { Container, Assets } from 'pixi.js';
import { Effect, EffectModel, Pause } from 'neutrinoparticles.pixi';
import { useTick } from '@pixi/react';

interface SpawnOptions {
  rotation?: number;
  scale?: number | [number, number, number];
  /** Время жизни в мс. Если не указано — удалится когда частиц станет 0 */
  duration?: number;
  /** Callback при удалении эффекта */
  onComplete?: () => void;
}

interface ManagedEffect {
  effect: Effect;
  removeAt?: number;
  onComplete?: () => void;
}

export const useVFXContainer = () => {
  const containerRef = useRef<Container>(null);
  const effectsRef = useRef<ManagedEffect[]>([]);
  const isUnmountedRef = useRef(false);

  // Обновление всех эффектов
  useTick((ticker) => {
    const now = performance.now();
    const dt = ticker.deltaMS / 1000;

    effectsRef.current = effectsRef.current.filter(({ effect, removeAt, onComplete }) => {
      // Проверяем время жизни
      if (removeAt !== undefined && now >= removeAt) {
        effect.parent?.removeChild(effect);
        effect.destroy();
        onComplete?.();
        return false;
      }

      // Обновляем эффект
      if (effect.ready()) {
        effect.update(dt);

        // Если нет duration — удаляем когда частиц 0
        if (removeAt === undefined && effect.getNumParticles() === 0) {
          effect.parent?.removeChild(effect);
          effect.destroy();
          onComplete?.();
          return false;
        }
      }

      return true;
    });
  });

  // Спавн эффекта
  const spawn = useCallback((
    effectAlias: string,
    position: [number, number, number],
    options?: SpawnOptions
  ): Effect | null => {
    if (isUnmountedRef.current) return null;

    const effectModel = Assets.get<EffectModel>(effectAlias);
    if (!effectModel) {
      console.error(`Effect model "${effectAlias}" not found`);
      return null;
    }

    const container = containerRef.current;
    if (!container) {
      console.error('VFX container not mounted');
      return null;
    }

    // Нормализуем scale
    const scale = options?.scale;
    const normalizedScale: [number, number, number] =
      typeof scale === 'number' ? [scale, scale, scale] :
        scale ?? [1, 1, 1];

    const effect = new Effect(effectModel, {
      position,
      rotation: options?.rotation ?? 0,
      scale: normalizedScale,
      pause: Pause.BEFORE_UPDATE_OR_RENDER,
      autoInit: true,
    });

    container.addChild(effect);

    effectsRef.current.push({
      effect,
      removeAt: options?.duration ? performance.now() + options.duration : undefined,
      onComplete: options?.onComplete,
    });

    return effect;
  }, []);

  // Очистка при размонтировании
  useEffect(() => {
    isUnmountedRef.current = false;

    return () => {
      isUnmountedRef.current = true;
      effectsRef.current.forEach(({ effect }) => {
        effect.parent?.removeChild(effect);
        effect.destroy();
      });
      effectsRef.current = [];
    };
  }, []);

  // Принудительная очистка всех эффектов
  const clear = useCallback(() => {
    effectsRef.current.forEach(({ effect }) => {
      effect.parent?.removeChild(effect);
      effect.destroy();
    });
    effectsRef.current = [];
  }, []);

  return {
    containerRef,
    spawn,
    clear,
    /** Текущее количество активных эффектов */
    get activeCount() { return effectsRef.current.length; }
  };
};
