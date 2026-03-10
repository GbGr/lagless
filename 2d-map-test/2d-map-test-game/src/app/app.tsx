import { FC } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { Loader } from './loader';

export const App: FC = () => {
  return (
    <Loader>
      <RouterProvider router={router} />
    </Loader>
  );
};
