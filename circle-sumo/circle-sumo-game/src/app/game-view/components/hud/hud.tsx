import './hud.scss';
import { FC, useEffect, useMemo, useState } from 'react';
import { useRunner } from '../../runner-provider';
import { CharacterPreview } from '../../../components/character-preview/character-preview';
import { PlayerResources } from '@lagless/core';
import { GameState, PlayerResource, Skin } from '@lagless/circle-sumo-simulation';

export const HUD: FC = () => {
  const runner = useRunner();

  const [ kills, setKills ] = useState(0);
  const [ timeElapsedSec, setTimeElapsedSec ] = useState(0);
  const [ playersLeft, setPlayersLeft ] = useState(0);

  const _GameState = useMemo(() => runner.DIContainer.resolve(GameState), [runner]);
  const _PlayerResources = useMemo(() => runner.DIContainer.resolve(PlayerResources), [runner]);
  const playerResource = useMemo(() => {
    return _PlayerResources.get(PlayerResource, runner.InputProviderInstance.playerSlot);
  }, [_PlayerResources, runner]);
  const skinId = useMemo(() => {
    return runner.DIContainer.resolve(Skin).unsafe.skinId[playerResource.safe.entity];
  }, [playerResource, runner.DIContainer]);

  useEffect(() => {
    return runner.Simulation.addTickHandler(() => {
      setKills(playerResource.safe.kills);
      setTimeElapsedSec(Math.floor(runner.Simulation.clock.getElapsedTime() / 1_000));
      setPlayersLeft(runner.Config.maxPlayers - _GameState.safe.playerFinishedCount);
    });
  }, [runner, playerResource, _GameState]);

  return (
    <div className="hud">
      <div className="hud__left">
        <CharacterPreview skinId={skinId} scale={0.575} x={24} y={24} />
        <div className="hud__kos">KOs: {kills}</div>
      </div>
      <div className="hud__middle">{formatTime(timeElapsedSec)}</div>
      <div className="hud__right">
        <div className="hud__label">{`Players\nLeft:`}</div>
        <div className="hud__value">{playersLeft}/{runner.Config.maxPlayers}</div>
      </div>
    </div>
  );
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
