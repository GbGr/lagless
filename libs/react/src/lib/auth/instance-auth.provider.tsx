import { FC, ReactNode } from 'react';
import { useAuthQuery } from './auth.query';

export const InstanceAuthContext: FC<{ children: ReactNode }> = ({ children }) => {
  const { data } = useAuthQuery();

  return data ? children : null;
};
