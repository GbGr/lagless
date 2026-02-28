import { useCallback, useState } from 'react';
import type { GamePreset } from '../types';

interface SavedConfig {
  name: string;
  preset: GamePreset;
  instanceCount: number;
}

const STORAGE_KEY = 'dev-player-presets';
const LAST_CONFIG_KEY = 'dev-player-last';

function loadPresets(): SavedConfig[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function useLocalStorage() {
  const [savedPresets, setSavedPresets] = useState<SavedConfig[]>(loadPresets);

  const savePreset = useCallback((name: string, preset: GamePreset, instanceCount: number) => {
    const configs = loadPresets();
    const idx = configs.findIndex((c) => c.name === name);
    const entry: SavedConfig = { name, preset, instanceCount };
    if (idx >= 0) configs[idx] = entry;
    else configs.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    setSavedPresets(configs);
  }, []);

  const loadPreset = useCallback((name: string): SavedConfig | null => {
    return loadPresets().find((c) => c.name === name) ?? null;
  }, []);

  const deletePreset = useCallback((name: string) => {
    const configs = loadPresets().filter((c) => c.name !== name);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    setSavedPresets(configs);
  }, []);

  const saveLastConfig = useCallback((preset: GamePreset, instanceCount: number) => {
    localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify({ preset, instanceCount }));
  }, []);

  const loadLastConfig = useCallback((): { preset: GamePreset; instanceCount: number } | null => {
    try {
      return JSON.parse(localStorage.getItem(LAST_CONFIG_KEY) || 'null');
    } catch {
      return null;
    }
  }, []);

  return { savedPresets, savePreset, loadPreset, deletePreset, saveLastConfig, loadLastConfig };
}
