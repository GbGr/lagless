import React, { FC, ReactNode, useCallback } from 'react';
import { Viewport, Viewport as PixiViewport } from 'pixi-viewport';
import { useApplication } from '@pixi/react';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const ViewportContext = React.createContext<PixiViewport>(null!);

export const useViewport = () => {
  return React.useContext(ViewportContext);
};

export const ViewportProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { app } = useApplication();
  const [ viewportRef, setViewportRef ] = React.useState<PixiViewport | null>(null);

  const initializeViewport = useCallback((viewport: Viewport) => {
    console.log('initializeViewport');

    viewport.drag().pinch().wheel().decelerate();
    setViewportRef(viewport);
  }, []);

  return app.renderer ? (
    <viewport
      worldWidth={10000}
      worldHeight={10000}
      screenWidth={app.renderer.width}
      screenHeight={app.renderer.height}
      events={app.renderer.events}
      ref={initializeViewport}
    >
      {viewportRef ? (
        <ViewportContext value={viewportRef}>
          {children}
        </ViewportContext>
      ) : null}
    </viewport>
  ) : null;
};
