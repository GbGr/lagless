import { createContext } from 'react';

export type PlayerSchema = {
  id: string;
  username: string;
  score: number;
  data: Record<string, unknown>;
  ownedSkins: number[];
};

export type AuthContextType = { player: PlayerSchema; token: string };

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const AuthContext = createContext<AuthContextType>(null!);
