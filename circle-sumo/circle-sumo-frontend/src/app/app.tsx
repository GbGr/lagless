import { FC } from 'react';
import { GameView } from './game-view/game-view';
import { ReactQueryProvider, InstanceAuthContext } from '@lagless/react';
import { LoadingScreen } from './loading-screen';

export const App: FC = () => {
  return (
    <ReactQueryProvider>
      <InstanceAuthContext fallback={<LoadingScreen />}>
        <div className="fixed top-0 left-0 w-full h-full">
          <GameView />
        </div>
      </InstanceAuthContext>
    </ReactQueryProvider>
  );
};
