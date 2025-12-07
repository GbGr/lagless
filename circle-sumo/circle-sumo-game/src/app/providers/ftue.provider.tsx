import { FC, ReactNode, useEffect } from 'react';
import { api, usePlayer } from '@lagless/react';
import { getRandomSolidSkinId, SumoPlayerData } from '@lagless/circle-sumo-simulation';

export const FtueProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const player = usePlayer();

  useEffect(() => {
    const data = player.data as SumoPlayerData;
    if (data.selectedSkinId === undefined) {
      data.selectedSkinId = getRandomSolidSkinId();
      api.put(`/sumo/player/onFtue/${data.selectedSkinId}`).catch(console.error);
    }
  }, [player.data, player.id]);

  return children;
};
