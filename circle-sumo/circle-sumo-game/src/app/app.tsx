import { FC } from 'react';
import { ReactQueryProvider, InstanceAuthContext } from '@lagless/react';
import { LoadingScreen } from './loading-screen';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { FtueProvider } from './providers/ftue.provider';
import { AssetsLoader } from './game-view/assets-loader';

export const App: FC = () => {
  return (
    <ReactQueryProvider>
      <InstanceAuthContext fallback={<LoadingScreen />}>
        <FtueProvider>
          <AssetsLoader>
            <RouterProvider router={router} />
          </AssetsLoader>
        </FtueProvider>
      </InstanceAuthContext>
    </ReactQueryProvider>
  );
};
