import { createBrowserRouter } from 'react-router-dom';
import { TitleScreen } from './screens/title.screen';
import { GameScreen } from './screens/game.screen';

export const router = createBrowserRouter([
  { path: '/', element: <TitleScreen /> },
  { path: '/game', element: <GameScreen /> },
]);
