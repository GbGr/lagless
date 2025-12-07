import './game-over.scss';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { useRunner } from '../../runner-provider';
import { PlayerResource, calculateScore } from '@lagless/circle-sumo-simulation';
import { PlayerResources } from '@lagless/core';
import { Button } from '../../../components/button/button';
import { useStartMatch } from '../../../hooks/use-start-match';
import { Dots } from '../../../components/dots';
import { useNavigate } from 'react-router-dom';
import { playTop1Confetti, playTop2Confetti, playTop3Confetti } from '../../../hooks/confetti';

export const GameOver: FC = () => {
  const runner = useRunner();
  const navigate = useNavigate();

  const [isGameOver, setIsGameOver] = useState(false);
  const scoreRef = useRef(0);
  const { isBusy, startMatch } = useStartMatch();

  const _PlayerResources = useMemo(() => runner.DIContainer.resolve(PlayerResources), [runner]);
  const playerResource = useMemo(() => {
    return _PlayerResources.get(PlayerResource, runner.InputProviderInstance.playerSlot);
  }, [_PlayerResources, runner]);

  useEffect(() => {
    let gameAlreadyOver = false;
    return runner.Simulation.addTickHandler(() => {
      if (playerResource.safe.finishedAtTick > 0) {
        scoreRef.current = calculateScore(
          playerResource.safe.kills,
          playerResource.safe.assists,
          playerResource.safe.positionInTop
        );
        setIsGameOver(true);
        if (!gameAlreadyOver) {
          switch (playerResource.safe.positionInTop) {
            case 1:
              playTop1Confetti().catch(console.error);
              break;
            case 2:
              playTop2Confetti().catch(console.error);
              break;
            case 3:
              playTop3Confetti().catch(console.error);
              break;
          }
        }
        gameAlreadyOver = true;
      } else {
        setIsGameOver(false);
      }
    });
  }, [runner, playerResource]);

  return !isGameOver ? null : (
    <div className="game-over__overlay">
      <div className="game-over">
        <div className="game-over__popover">
          <div className="game-over__title">You Out</div>
          <div className="game-over__stat">
            <div className="game-over__text">TOP</div>
            <div className="game-over__value game-over__value_accent">{playerResource.safe.positionInTop}</div>
          </div>
          <div className="game-over__stat">
            <div className="game-over__text">KOs</div>
            <div className="game-over__value">{playerResource.safe.kills}</div>
          </div>
          <div className="game-over__stat">
            <div className="game-over__text">Points Earned</div>
            <div className="game-over__value">{scoreRef.current}</div>
          </div>
          <Button mode="gold" size="medium">
            <small>x</small>2 Reward
          </Button>
        </div>
        <div className="game-over__actions">
          <Button mode="primary" size="medium" onClick={startMatch}>
            {isBusy ? (
              <span>
                Connecting <Dots />
              </span>
            ) : (
              'Play Again'
            )}
          </Button>
          <Button mode="secondary" size="medium" onClick={() => navigate('/roulette')}>
            Get New Skin
          </Button>
        </div>
      </div>
    </div>
  );
};
