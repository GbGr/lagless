import { FC, useEffect, useRef } from 'react';
import { useTick } from '@pixi/react';
import { Container, Graphics } from 'pixi.js';

export interface DebugRenderData {
  vertices: Float32Array;
  colors: Float32Array;
}

export interface DebugPhysics2dRendererProps {
  getBuffers: () => DebugRenderData;
  strokeWidth?: number;
  parent: Container;
}

export const DebugPhysics2dRenderer: FC<DebugPhysics2dRendererProps> = ({ getBuffers, strokeWidth = 0.5, parent }) => {
  const graphicsRef = useRef<Graphics | null>(null);

  useEffect(() => {
    const g = new Graphics();
    g.zIndex = 999999;
    parent.sortableChildren = true;
    graphicsRef.current = g;
    parent.addChild(g);

    return () => {
      parent.removeChild(g);
      g.destroy();
      graphicsRef.current = null;
    };
  }, [parent]);

  useTick(() => {
    const g = graphicsRef.current;
    if (!g) return;

    const buffers = getBuffers();
    g.clear();

    const vtx = buffers.vertices;
    const cls = buffers.colors;
    const segmentCount = vtx.length / 4;
    if (segmentCount === 0) return;

    let batchColor = segmentColor(cls, 0);
    let batchAlpha = cls[3];

    g.moveTo(vtx[0], vtx[1]);
    g.lineTo(vtx[2], vtx[3]);

    for (let i = 1; i < segmentCount; i++) {
      const color = segmentColor(cls, i);
      const alpha = cls[i * 8 + 3];

      if (color !== batchColor || alpha !== batchAlpha) {
        g.stroke({ width: strokeWidth, color: batchColor, alpha: batchAlpha });
        batchColor = color;
        batchAlpha = alpha;
      }

      g.moveTo(vtx[i * 4], vtx[i * 4 + 1]);
      g.lineTo(vtx[i * 4 + 2], vtx[i * 4 + 3]);
    }

    g.stroke({ width: strokeWidth, color: batchColor, alpha: batchAlpha });
  });

  return null;
};

function segmentColor(cls: Float32Array, i: number): number {
  return ((cls[i * 8] * 255) << 16) | ((cls[i * 8 + 1] * 255) << 8) | (cls[i * 8 + 2] * 255);
}
