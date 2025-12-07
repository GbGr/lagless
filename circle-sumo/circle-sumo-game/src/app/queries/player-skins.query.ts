import { api, currentQueryClient } from '@lagless/react';
import { useQuery } from '@tanstack/react-query';

const playerSkinsQuery = () => {
  return {
    queryKey: [ 'playerSkins' ],
    queryFn: async () => {
      const { data } = await api.get<number[]>('/sumo/player/getPlayerSkins');

      return data;
    },
  };
};

export const usePlayerSkinsQuery = () => {
  return useQuery(playerSkinsQuery());
};

export const invalidatePlayerSkins = async () => {
  await currentQueryClient.invalidateQueries(playerSkinsQuery());
};
