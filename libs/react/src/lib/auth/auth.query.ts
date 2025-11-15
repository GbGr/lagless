import { AuthTokenStore } from './auth-token-store';
import { type PlayerSchema } from '@lagless/schemas';
import { api } from './api';
import { useQuery } from '@tanstack/react-query';
import { currentQueryClient } from '../react-query.provider';

export const usePlayerQuery = () => {
  const { data } = useAuthQuery();
  return data?.player as PlayerSchema;
}

export const useAuthQuery = () => {
  return useQuery(authQuery());
};

export const updatePlayer = async (player: PlayerSchema) => {
  const data = await api.get<{ player: PlayerSchema }>('/player/me').then((res) => res.data);
  currentQueryClient.setQueryData(['auth'], { token: AuthTokenStore.get(), player: data });
  return data;
};

export const authQuery = () => {
  return {
    queryKey: ['auth'] as const,
    queryFn: async () => {
      return instantAuth();
    },
    staleTime: Infinity,
  };
};

const instantAuth = async () => {
  let token = AuthTokenStore.get();
  let player: PlayerSchema | null = null;

  if (token) {
    try {
      const data = await api.post<{ token: string; player: PlayerSchema }>('/player/login').then((res) => res.data);
      token = data.token;
      player = data.player;
    } catch (e) {
      console.warn('Failed to login', e);
      token = null;
      player = null;
    }
  }

  if (!token) {
    const data = await api
      .post<{ token: string; player: PlayerSchema }>('/player/auth/instant')
      .then((res) => res.data);
    token = data.token;
    player = data.player;
    AuthTokenStore.set(token);
  }

  return { token, player };
};
