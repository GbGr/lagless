import { FC, ReactNode } from 'react';
import { useAuthQuery } from './auth.query';

export const InstanceAuthContext: FC<{ children: ReactNode, fallback: ReactNode }> = ({ children, fallback }) => {
  const { data } = useAuthQuery();

  return data ? children : fallback;
};
