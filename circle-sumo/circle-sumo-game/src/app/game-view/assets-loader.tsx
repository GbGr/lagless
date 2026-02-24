// ===== File: src/components/assets-loader/index.tsx =====

import { FC, ReactNode, useEffect, useState } from 'react';
import { Assets, BitmapFont } from 'pixi.js';
import { LoadingScreen } from '../loading-screen';
import { MathOps } from '@lagless/math';

// Текстуры
import BODY from '../../assets/textures/BODY.png';
import JAMS from '../../assets/textures/JAMS.png';
import EYES from '../../assets/textures/EYES.png';
import EYES_CLOSED from '../../assets/textures/EYES_CLOSED.png';
import ARROW from '../../assets/textures/ARROW.png';
import ARROW_GRADIENT from '../../assets/textures/ARROW_GRADIENT.png';
import SHADOW from '../../assets/textures/SHADOW.png';
import CARD_COMMON from '../../assets/textures/card_common.png';
import CARD_RARE from '../../assets/textures/card_rare.png';
import CARD_LEGENDARY from '../../assets/textures/card_legendary.png';
import STAR from '../../assets/textures/Star.png';
import { neutrinoLoadData } from './components/neutrino';

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
    { alias: 'CARD_COMMON', src: CARD_COMMON },
    { alias: 'CARD_RARE', src: CARD_RARE },
    { alias: 'CARD_LEGENDARY', src: CARD_LEGENDARY },
    { alias: 'STAR', src: STAR },
    // Neutrino эффект с правильным loadData
    {
      alias: 'TrianglesImpact',
      src: 'neutrino/TrianglesImpact.js',
      data: neutrinoLoadData,
    },
  ],
};

export const AssetsLoader: FC<{ children: ReactNode }> = ({ children }) => {
  const [isLoaded, setIsLoaded] = useState<boolean | null>(null);

  useEffect(() => {
    console.log('Loading assets...');
    Assets.addBundle(AssetsBundle.name, AssetsBundle.assets);

    const mathInitPromise = MathOps.init();
    const loadBundlePromise = Assets.loadBundle(AssetsBundle.name, (progress) => {
      console.log('Loading progress:', progress);
    });

    BitmapFont.install({
      name: 'CountdownFont',
      resolution: window.devicePixelRatio || 1,
      chars: ['3', '2', '1', 'G', 'O', '!'],
      style: {
        fontFamily: '"Alegreya Sans SC"',
        fontSize: 200,
        fill: '#FFFFFF',
        fontStyle: 'normal',
      },
    });

    Promise.all([loadBundlePromise, mathInitPromise])
      .then(() => {
        console.log('Assets loaded');
        setIsLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load assets', err);
        setIsLoaded(false);
      });
  }, []);

  return isLoaded === null ? (
    <LoadingScreen />
  ) : isLoaded ? (
    children
  ) : (
    <div>Failed to load assets</div>
  );
};
