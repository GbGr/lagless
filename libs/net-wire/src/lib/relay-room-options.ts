export interface ColyseusRelayRoomOptions {
  frameLength: number;
  maxPlayers: number;
  gameId: string;
  allowLateJoin?: boolean;
  lateJoinMinVotes?: number;
  lateJoinRequestTimeoutMs?: number;
  lateJoinMaxSnapshotBytes?: number;
  lateJoinPreferredChunkSize?: number;
  inputBufferRetentionTicks?: number;
  seatReservationTimeSec?: number;
}
