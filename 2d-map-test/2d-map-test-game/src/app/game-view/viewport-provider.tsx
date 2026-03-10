import React, { FC, ReactNode, useCallback, useEffect } from 'react';
import { Viewport as PixiViewport } from 'pixi-viewport';
import { useApplication } from '@pixi/react';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const ViewportContext = React.createContext<PixiViewport>(null!);

export const useViewport = () => {
  return React.useContext(ViewportContext);
};

interface ViewportProviderProps {
  children: ReactNode;
  worldWidth: number;
  worldHeight: number;
}

export const ViewportProvider: FC<ViewportProviderProps> = ({ children, worldWidth, worldHeight }) => {
  const { app } = useApplication();
  const [viewportRef, setViewportRef] = React.useState<PixiViewport | null>(null);

  const initializeViewport = useCallback((viewport: PixiViewport) => {
    if (!viewport) return;
    setViewportRef(viewport);

    viewport.drag()
      .pinch()
      .wheel()
      .clampZoom({ minScale: 0.5, maxScale: 8 });

    viewport.moveCenter(worldWidth / 2, worldHeight / 2);
    viewport.setZoom(1);
  }, [worldWidth, worldHeight]);

  useEffect(() => {
    if (!app.renderer || !viewportRef) return;

    const resizeHandler = () => {
      viewportRef.resize(app.renderer.width, app.renderer.height);
    };

    const resizeObserver = new ResizeObserver(resizeHandler);
    resizeObserver.observe(app.renderer.canvas);
    return () => { resizeObserver.disconnect(); };
  }, [app.renderer?.canvas, viewportRef]);

  return app.renderer ? (
    <viewport
      worldWidth={worldWidth}
      worldHeight={worldHeight}
      screenWidth={app.renderer.width}
      screenHeight={app.renderer.height}
      events={app.renderer.events}
      ref={initializeViewport}
    >
      {viewportRef ? <ViewportContext value={viewportRef}>{children}</ViewportContext> : null}
    </viewport>
  ) : null;
};
