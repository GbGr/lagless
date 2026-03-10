import { FC, ReactNode, useEffect, useState } from 'react';
import { Assets, Spritesheet, Texture } from 'pixi.js';
import { MathOps } from '@lagless/math';
import atlasData from '../assets/spritesheets/atlas.json';
import atlasSrc from '../assets/spritesheets/atlas.png';

async function loadAssets(): Promise<void> {
  const [, atlasTexture] = await Promise.all([
    MathOps.init(),
    Assets.load<Texture>(atlasSrc),
  ]);

  const sheet = new Spritesheet(atlasTexture, atlasData);
  await sheet.parse();

  // Register each frame without .png suffix → Assets.get('garage-roof') works everywhere
  for (const [name, texture] of Object.entries(sheet.textures)) {
    Assets.cache.set(name.replace('.png', ''), texture);
  }
}

export const Loader: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    loadAssets()
      .then(() => { if (!cancelled) setState('ready'); })
      .catch((err) => {
        console.error('Failed to load assets', err);
        if (!cancelled) setState('error');
      });
    return () => { cancelled = true; };
  }, []);

  if (state === 'error') return <div style={{ color: '#ff6b6b', padding: 32 }}>Failed to load assets</div>;
  if (state === 'loading') return null;
  return <>{children}</>;
};
