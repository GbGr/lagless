import { CircleSumoInputRegistry } from '@lagless/circle-sumo-simulation';
import { AbstractInputProvider, ECSConfig, LocalInputProvider } from '@lagless/core';
import { useCallback, useState } from 'react';
import { AuthTokenStore } from '@lagless/react';
import { useNavigate } from 'react-router-dom';

export class ProviderStore {
  private static readonly _listeners = new Set<() => void>();
  private static _provider: AbstractInputProvider | undefined;

  public static onProvider(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  public static set(provider: AbstractInputProvider) {
    this._provider = provider;
    for (const listener of this._listeners) {
      listener();
    }
  }

  public static getInvalidate(): AbstractInputProvider | undefined {
    const provider = this._provider;
    this._provider = undefined;
    return provider;
  }
}

export const useStartMatch = () => {
  const [ isBusy, setIsBusy ] = useState(false);
  const navigate = useNavigate();

  const startMatch = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const token = AuthTokenStore.get();
      if (!token) throw new Error('No auth token found');
      const ecsConfig = new ECSConfig({ fps: 60 });
      const inputProvider = new LocalInputProvider(ecsConfig, CircleSumoInputRegistry);

      ProviderStore.set(inputProvider);
      navigate('/game');
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, navigate]);

  return  {
    isBusy,
    startMatch,
  }
};
