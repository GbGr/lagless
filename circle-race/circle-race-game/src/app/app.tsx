import { FC } from 'react';
import { GameView } from './game-view/game-view';

export const App: FC = () => {
  return (
    <div className='fixed top-0 left-0 w-full h-full bg-gray-50'>
      <GameView />
    </div>
  );
};
