import './balance.scss';
import { FC } from 'react';
import { Coin } from '../coin';
import { usePlayer } from '@lagless/react';

export const Balance: FC = () => {
  const player = usePlayer();

  return (
    <div className="balance">
      <Coin className="balance__coin" />
      <span className="balance__amount">{player.score}</span>
    </div>
  );
};
