import { createContext } from 'react';
import { type PlayerSchema } from '@lagless/schemas';

export type AuthContextType = { player: PlayerSchema; token: string };

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
export const AuthContext = createContext<AuthContextType>(null!);
