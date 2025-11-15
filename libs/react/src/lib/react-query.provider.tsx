import { FC, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const currentQueryClient = new QueryClient();

export const ReactQueryProvider: FC<{ children: ReactNode }> = ({ children }) => {

  return (
    <QueryClientProvider client={currentQueryClient}>
      {children}
    </QueryClientProvider>
  );
};
