import React, { FC, ReactNode, useCallback, useEffect } from 'react';
import { Viewport, Viewport as PixiViewport } from 'pixi-viewport';
import { useApplication } from '@pixi/react';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const ViewportContext = React.createContext<PixiViewport>(null!);

export const useViewport = () => {
  return React.useContext(ViewportContext);
};

export const ViewportProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { app } = useApplication();
  const [viewportRef, setViewportRef] = React.useState<PixiViewport | null>(null);

  const initializeViewport = useCallback((viewport: Viewport) => {
    setViewportRef(viewport);
    viewport.setZoom(0.75);
    viewport.moveCenter(0, 0);
  }, []);

  useEffect(() => {
    if (!app.renderer) return;
    const resizeHandler = () => {
      if (viewportRef) {
        console.log('Resizing viewport', app.renderer.width, app.renderer.height);
        viewportRef.resize(app.renderer.width, app.renderer.height);
      }
    };

    const resizeObserver = new ResizeObserver(resizeHandler);
    resizeObserver.observe(app.renderer.canvas);

    return () => {
      resizeObserver.disconnect();
    }
  }, [app.renderer?.canvas, app.renderer?.height, app.renderer?.width, viewportRef]);

  return app.renderer ? (
    <viewport
      worldWidth={1024}
      worldHeight={1024}
      screenWidth={app.renderer.width}
      screenHeight={app.renderer.height}
      events={app.renderer.events}
      ref={initializeViewport}
    >
      {viewportRef ? <ViewportContext value={viewportRef}>{children}</ViewportContext> : null}
    </viewport>
  ) : null;
};
