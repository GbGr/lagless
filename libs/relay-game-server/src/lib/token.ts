export interface MatchTokenPayload {
  playerId: string;
  matchId: string;
  playerSlot: number;
}

export function generateToken(playerId: string, matchId: string, playerSlot: number): string {
  return btoa(JSON.stringify({ playerId, matchId, playerSlot, exp: Date.now() + 60_000 }));
}

export function validateToken(token: string): MatchTokenPayload | null {
  try {
    const p = JSON.parse(atob(token));
    if (typeof p.exp === 'number' && p.exp < Date.now()) return null;
    return { playerId: p.playerId, matchId: p.matchId, playerSlot: p.playerSlot };
  } catch {
    return null;
  }
}
