import { FC } from 'react';
import { GameView } from './game-view/game-view';
import { ReactQueryProvider, InstanceAuthContext } from '@lagless/react';

export const App: FC = () => {
  return (
    <ReactQueryProvider>
      <InstanceAuthContext>
        <div className='fixed top-0 left-0 w-full h-full bg-gray-50'>
          <GameView />
        </div>
      </InstanceAuthContext>
    </ReactQueryProvider>
  );
};
