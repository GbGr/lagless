import { FC, useMemo } from 'react';
import { TerrainWorld } from './terrain-world';
import { useViewport } from '../viewport-provider';
import { TerrainChunkCache } from './terrain-chunk-cache';

const CHUNK_SIZE = 256; // pixels per chunk
const WORLD_CHUNKS_X = 10;
const WORLD_CHUNKS_Y = 10;


export const TerrainView: FC = () => {
  const viewport = useViewport();

  const chunkCache = useMemo(() => {
    return new TerrainChunkCache({
      seed: 'high-contrast-world',
      chunkSize: CHUNK_SIZE,
      chunksX: WORLD_CHUNKS_X,
      chunksY: WORLD_CHUNKS_Y,
      baseFrequency: 0.002,
      octaves: 3,
      persistence: 0.5,
      lacunarity: 2.0,
    });
  }, []);

  useMemo(() => {
    return new TerrainWorld({
      viewport,
      cache: chunkCache,
      marginChunks: 1,
    });
  }, [chunkCache, viewport]);

  return null;
};
