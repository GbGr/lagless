import { FC, useCallback, useMemo, useRef } from 'react';
import { useRunner } from '../runner-provider';
import { GameState } from '@lagless/circle-sumo-simulation';
import { useTick } from '@pixi/react';
import { TextStyle, BitmapText } from 'pixi.js';
import { useViewport } from '../viewport-provider';

const STEPS = ['3', '2', '1', 'GO!'];
const TICKS_PER_STEP = 60; // 1 секунда = 60 тиков
// Сколько шагов занимают именно цифры (исключая GO)
const COUNTDOWN_STEPS_COUNT = STEPS.length - 1;
// Общая длительность пре-ролла (3 * 60 = 180 тиков)
const TOTAL_COUNTDOWN_DURATION = COUNTDOWN_STEPS_COUNT * TICKS_PER_STEP;

export const StartGameCountdown: FC = () => {
  const runner = useRunner();
  const viewport = useViewport();
  const simulation = useMemo(() => runner.Simulation, [runner]);
  const gameState = useMemo(() => runner.DIContainer.resolve(GameState), [runner]);

  const textRef = useRef<BitmapText>(null);

  const textStyle = useMemo(() => {
    return new TextStyle({
      fontSize: 200,
      fill: '#FFFFFF',
      fontFamily: 'CountdownFont',
      fontStyle: 'normal',
      align: 'center',
    });
  }, []);

  useTick(useCallback(() => {
    const textInstance = textRef.current;
    if (!textInstance) return;

    textInstance.rotation = -viewport.rotation;

    const currentTick = simulation.tick;
    const startTick = gameState.safe.startedAtTick;

    // 1. Вычисляем, когда должна начаться анимация (за 3 секунды до старта игры)
    const animationStartTick = startTick - TOTAL_COUNTDOWN_DURATION;

    // 2. Сколько тиков прошло с момента начала анимации
    const ticksSinceAnimationStart = currentTick - animationStartTick;

    // Если мы еще слишком рано (до начала отсчета), скрываем текст
    if (ticksSinceAnimationStart < 0) {
      textInstance.visible = false;
      return;
    }

    // 3. Определяем индекс шага
    // 0..59 -> индекс 0 ('3')
    // 60..119 -> индекс 1 ('2')
    // 120..179 -> индекс 2 ('1')
    // 180..239 -> индекс 3 ('GO!')
    const stepIndex = Math.floor(ticksSinceAnimationStart / TICKS_PER_STEP);

    if (stepIndex >= 0 && stepIndex < STEPS.length) {
      textInstance.visible = true;
      const stepText = STEPS[stepIndex];

      if (textInstance.text !== stepText) {
        textInstance.text = stepText;
      }

      // Анимация внутри шага (от 0.0 до 1.0)
      const progress = (ticksSinceAnimationStart % TICKS_PER_STEP) / TICKS_PER_STEP;

      // Эффект удара: резко увеличивается и плавно уменьшается
      // 3, 2, 1 - просто пульсация
      // GO! - может быть чуть больше
      const baseScale = stepText === 'GO!' ? 1.2 : 1.0;
      const scale = (1.5 - progress * 0.5) * baseScale;
      textInstance.scale.set(scale);

      // Fade out для "GO!" во второй половине его показа
      if (stepText === 'GO!' && progress > 0.5) {
        textInstance.alpha = 1 - (progress - 0.5) * 2;
      } else {
        textInstance.alpha = 1;
      }

    } else {
      // Отсчет (включая время показа GO!) закончился
      textInstance.visible = false;
    }

  }, [simulation, gameState]));

  return (
    <pixiBitmapText
      ref={textRef}
      text=""
      anchor={0.5}
      x={0}
      y={0}
      style={textStyle}
    />
  );
};
