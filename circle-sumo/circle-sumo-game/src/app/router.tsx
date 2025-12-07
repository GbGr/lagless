import { createBrowserRouter, useOutlet } from 'react-router-dom';
import { FC } from 'react';
import { TitleScreen } from './screens/title.screen';
import { GameScreen } from './screens/game.screen';
import { RouletteScreen } from './screens/roulette/roulette.screen';
import { LockerScreen } from './screens/locker/locker.screen';

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
      {
        path: 'roulette',
        Component: RouletteScreen,
      },
      {
        path: 'locker',
        Component: LockerScreen,
      }
    ],
  },
]);
