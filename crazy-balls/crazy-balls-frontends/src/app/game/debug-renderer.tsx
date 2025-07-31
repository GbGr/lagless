import { FC, useCallback, useRef } from 'react';
import { Graphics } from 'pixi.js';
import { useSimulationRunner } from './simulation-runner-provider';
import { useApplication, useTick } from '@pixi/react';

export const DebugRenderer: FC = () => {
  const { app } = useApplication();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  globalThis['__PIXI_APP__'] = app;
  const { runner } = useSimulationRunner();
  const graphicsRef = useRef<Graphics>(null);

  useTick(() => {
    if (!graphicsRef.current) return;
    draw(graphicsRef.current)
  });

  const draw = useCallback((g: Graphics) => {
    const buffers = runner.Physics2dSimulation.physicsWorld.debugRender();
    const vtx = buffers.vertices;
    const cls = buffers.colors;

    g.clear();

    for (let i = 0; i < vtx.length / 4; i += 1) {
      const color = rgb2hex(cls[i * 8], cls[i * 8 + 1], cls[i * 8 + 2]);
      g.moveTo(vtx[i * 4], -vtx[i * 4 + 1]);
      g.lineTo(vtx[i * 4 + 2], -vtx[i * 4 + 3]);
      g.stroke({ color, width: 1 / 20 });
    }
  }, [runner]);

  return <pixiGraphics ref={graphicsRef} draw={noop} scale={20} />;
};

const noop = () => {
  // noop
};

function rgb2hex(r: number, g: number, b: number) {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
}
