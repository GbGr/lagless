import { FC, ReactNode, useEffect, useState } from 'react';
import { Assets } from 'pixi.js';
import { LoadingScreen } from '../loading-screen';
import BODY from '../../assets/textures/BODY.png';
import JAMS from '../../assets/textures/JAMS.png';
import EYES from '../../assets/textures/EYES.png';
import EYES_CLOSED from '../../assets/textures/EYES_CLOSED.png';
import ARROW from '../../assets/textures/ARROW.png';
import ARROW_GRADIENT from '../../assets/textures/ARROW_GRADIENT.png';
import SHADOW from '../../assets/textures/SHADOW.png';

export const AssetsBundle = {
  name: 'circle-sumo-assets',
  assets: [
    { alias: 'BODY', src: BODY },
    { alias: 'JAMS', src: JAMS },
    { alias: 'EYES', src: EYES },
    { alias: 'EYES_CLOSED', src: EYES_CLOSED },
    { alias: 'ARROW', src: ARROW },
    { alias: 'ARROW_GRADIENT', src: ARROW_GRADIENT },
    { alias: 'SHADOW', src: SHADOW },
  ],
};

export const AssetsLoader: FC<{ children: ReactNode }> = ({ children }) => {
  const [isLoaded, setIsLoaded] = useState<boolean | null>(null);

  useEffect(() => {
    console.log('Loading assets...');
    Assets.addBundle(AssetsBundle.name, AssetsBundle.assets);
    Assets.loadBundle(AssetsBundle.name, console.log).then(() => setIsLoaded(true));
  }, []);

  return isLoaded === null ? <LoadingScreen /> : isLoaded ? children : <div>Failed to load assets</div>;
};
