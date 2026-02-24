import { createBrowserRouter, useOutlet } from 'react-router-dom';
import { FC } from 'react';
import { TitleScreen } from './screens/title.screen';
import { GameScreen } from './screens/game.screen';

const Root: FC = () => {
  return useOutlet();
};

export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      {
        index: true,
        Component: TitleScreen,
      },
      {
        path: 'game',
        Component: GameScreen,
      },
    ],
  },
]);
