# Multiplayer Implementation Plan

This document describes the complete multiplayer implementation for the Lagless framework, including matchmaking, relay server, and client-side networking.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Design Decisions](#design-decisions)
3. [Protocol Specification](#protocol-specification)
4. [Server Implementation](#server-implementation)
5. [Client Implementation](#client-implementation)
6. [Integration with Circle Sumo](#integration-with-circle-sumo)
7. [Constants and Configuration](#constants-and-configuration)
8. [Implementation Order](#implementation-order)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                     │
│                                                                         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐    │
│  │MatchmakingClient│────►│RelayInputProvider────►│  ECSSimulation  │    │
│  │                 │     │                 │     │                 │    │
│  │ - join(scope)   │     │ - send inputs   │     │ - deterministic │    │
│  │ - onMatchFound  │     │ - receive fanout│     │ - rollback      │    │
│  │ - disconnect    │     │ - clock sync    │     │ - snapshots     │    │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
              │                        │
              │ WebSocket              │ WebSocket
              │ /matchmaking           │ /match/:id
              ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SERVER (Encore.ts)                              │
│                                                                         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐    │
│  │  /matchmaking   │     │   /match/:id    │     │     Redis       │    │
│  │  streamInOut    │     │   streamInOut   │     │                 │    │
│  │                 │     │                 │     │ - queues        │    │
│  │ - JoinQueue     │────►│ - MatchRoom     │◄───►│ - match state   │    │
│  │ - MatchFound    │     │ - validate tick │     │ - pub/sub       │    │
│  │ - cleanup on DC │     │ - fanout inputs │     │                 │    │
│  └─────────────────┘     └─────────────────┘     └─────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. MATCHMAKING PHASE
   Client → JoinQueue → Server adds to Redis queue
   Server → QueueStatus → Client (position updates)
   Server → MatchFound → Client (match ready)

2. MATCH PHASE
   Client → Connect /match/:id with JWT token
   Server → ServerHello (seed, slot, tick, players, scope)
   Client ↔ Server: TickInput / TickInputFanout / CancelInput / Ping / Pong

3. INPUT PROCESSING
   Client prediction: input scheduled for tick T+delay, applied locally
   Server validation: check tick range, broadcast or cancel
   Client rollback: if authoritative input tick < current tick, rollback and resimulate
```

---

## Design Decisions

### 1. Relay Model (No Server Simulation)

The server acts as an **input relay only**:
- Server does NOT run game simulation
- Server receives inputs, validates tick range, broadcasts to all clients
- Each client runs deterministic simulation independently
- Identical inputs + identical seed = identical game state

**Pros:**
- Simple server implementation
- Lower server CPU usage
- Easy horizontal scaling

**Cons:**
- No server-side cheat detection at simulation level
- Clients must trust each other's inputs

### 2. Server as Authoritative Time Source

Server maintains the authoritative game clock:
- `serverTick = floor((now - matchStartTime) / tickMs)`
- Clients sync their clocks via Ping/Pong
- Client local tick = server tick + calculated offset
- All input validation based on server tick

### 3. Scoped Matchmaking

Matchmaking queues are scoped by configuration hash:
- Client sends `MatchmakingScope` with game parameters
- Server computes hash of scope → queue key
- Players with identical scope are matched together
- Match room inherits the same scope

This allows different game configurations (tick rate, player count, etc.) to have separate queues.

### 4. WebSocket for Everything

Both matchmaking and match use WebSocket (Encore.ts `streamInOut`):
- Matchmaking: graceful disconnect removes player from queue
- Match: real-time bidirectional communication

### 5. Bot Detection via Masked UUID

Bots are identified by their UUID structure:
- `UUID.generateMasked()` creates bot IDs
- `UUID.isMaskedUint8(bytes)` / `UUID.isMaskedString(str)` detects bots
- Last 4 bytes of masked UUID = FNV-1a hash of first 12 bytes
- False positive rate: 1 in ~4.3 billion

### 6. Redis for Scalability

Using `ioredis` (not Encore Cache API) for:
- Queue storage (ZSET sorted by join time)
- Match state (HASH)
- Pub/Sub for cross-instance communication (future)
- Supports multiple server instances behind load balancer

### 7. Simple MMR Matching

When `waitTimeoutMs` expires:
- If enough players: sort by MMR proximity, take best matches
- If few players: take all available + fill with bots
- No complex ELO algorithms, just proximity sorting

### 8. Lag Handling with CancelInput

If a player's input is too old (severe lag):
- Server rejects the input (doesn't broadcast)
- Server sends `CancelInput` back to lagging client
- Client rolls back and removes the cancelled input
- Only the lagging player experiences issues

---

## Protocol Specification

### Matchmaking Messages (JSON over WebSocket)

#### Client → Server

```typescript
// Join the matchmaking queue
interface JoinQueueMessage {
  type: 'join';
  playerId: string;           // UUID string
  mmr?: number;               // Optional MMR for ranking
  scope: MatchmakingScope;    // Game configuration
  playerData: {               // Data for PlayerJoined RPC
    [key: string]: unknown;   // e.g., { skinId: 5 }
  };
}
```

#### Server → Client

```typescript
// Queue status update
interface QueueStatusMessage {
  type: 'queued';
  position: number;           // Position in queue
  playersInQueue: number;     // Total players waiting
}

// Match found notification
interface MatchFoundMessage {
  type: 'match_found';
  matchId: string;            // UUID of the match
  token: string;              // JWT for match connection
}

// Error
interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}
```

### MatchmakingScope

```typescript
interface MatchmakingScope {
  // Identity
  gameType: string;              // e.g., "circle-sumo"

  // Timing
  tickRate: number;              // e.g., 60 (ticks per second)

  // Players
  maxPlayers: number;            // e.g., 4
  minPlayersToStart: number;     // e.g., 1 (allows solo + bots)
  waitTimeoutMs: number;         // e.g., 7000 (7 seconds)

  // Input validation
  maxPastTicks: number;          // e.g., 30 (~500ms at 60fps)
  maxFutureTicks: number;        // e.g., 10 (~166ms at 60fps)

  // MMR (optional)
  mmrRange?: number;             // Max MMR difference for matching

  // Game-specific configuration
  gameConfig?: {
    [key: string]: unknown;      // e.g., { arenaRadius: 500 }
  };
}
```

### Match Messages (Binary Protocol)

All match messages use the existing binary protocol from `libs/net-wire`.

#### Message Types (MsgType enum)

```typescript
enum MsgType {
  ServerHello = 1,
  TickInput = 2,
  TickInputFanout = 3,
  PlayerFinishedGame = 4,
  CancelInput = 5,
  Ping = 6,
  Pong = 7,
}
```

#### Header (2 bytes)

```typescript
HeaderStruct = {
  version: uint8,    // Protocol version (1)
  type: uint8,       // MsgType
}
```

#### ServerHello (Server → Client)

Sent immediately after WebSocket connection is established.

```typescript
// Binary part
ServerHelloStruct = {
  seed0: float64,           // First half of 128-bit seed
  seed1: float64,           // Second half of 128-bit seed
  playerSlot: uint8,        // This client's slot (0-255)
  serverTick: uint32,       // Current server tick for sync
  playersCount: uint8,      // Number of players (including bots)
  scopeJsonLength: uint16,  // Length of scope JSON
}

// Variable part (after struct)
// For each player:
//   - playerId: 16 bytes (UUID, masked for bots)
//   - slot: 1 byte
//   - playerDataJsonLength: 2 bytes
//   - playerDataJson: N bytes (or empty for bots)
// Finally:
//   - scopeJson: N bytes
```

#### TickInput (Client → Server)

```typescript
TickInputStruct = {
  tick: uint32,             // Target simulation tick
  playerSlot: uint8,        // Sender's slot
  kind: uint8,              // 0 = Client, 1 = Server (unused in relay)
  seq: uint32,              // Sequence number for ordering
}
// Followed by: input payload bytes (game-specific)
```

#### TickInputFanout (Server → Client)

Broadcasts one or more inputs to all clients.

```typescript
TickInputFanoutStruct = {
  inputCount: uint8,        // Number of inputs in this message
}
// Followed by: inputCount × (TickInputStruct + payload)
```

#### CancelInput (Server → Client)

Sent when server rejects an input (too old or too far in future).

```typescript
CancelInputStruct = {
  tick: uint32,             // Tick of cancelled input
  seq: uint32,              // Sequence of cancelled input
  reason: uint8,            // CancelReason enum
}

enum CancelReason {
  TooOld = 0,               // Input tick too far in past
  TooFarFuture = 1,         // Input tick too far in future
  InvalidPlayer = 2,        // Wrong player slot
}
```

#### Ping (Client → Server)

```typescript
PingStruct = {
  cSend: float32,           // Client send timestamp (ms)
}
```

#### Pong (Server → Client)

```typescript
PongStruct = {
  cSend: float32,           // Echo of client send time
  sRecv: float32,           // Server receive time (ms)
  sSend: float32,           // Server send time (ms)
  sTick: uint32,            // Server's current tick
}
```

#### PlayerFinishedGame (Client → Server)

Notifies server that player has finished (for early result retrieval).

```typescript
PlayerFinishedGameStruct = {
  playerSlot: uint8,
  // Game-specific result data follows
}
```

---

## Server Implementation

### Directory Structure

```
apps/server/
├── encore.app.ts              # Encore app configuration
├── package.json
├── tsconfig.json
├── matchmaking/
│   ├── matchmaking.ts         # streamInOut endpoint
│   ├── queue.ts               # Redis queue operations
│   ├── matcher.ts             # Match formation logic
│   └── encore.service.ts      # Encore service definition
├── match/
│   ├── match.ts               # streamInOut endpoint
│   ├── room.ts                # MatchRoom class
│   ├── clock.ts               # Server authoritative clock
│   ├── validation.ts          # Input tick validation
│   └── encore.service.ts      # Encore service definition
└── shared/
    ├── redis.ts               # ioredis client setup
    ├── jwt.ts                 # JWT generation/validation
    ├── types.ts               # Shared TypeScript types
    └── config.ts              # Environment configuration
```

### Matchmaking Service

#### Endpoint: `/matchmaking` (streamInOut)

```typescript
// matchmaking/matchmaking.ts
import { api } from "encore.dev/api";
import { StreamInOut } from "encore.dev/api";

interface MatchmakingIn {
  type: 'join';
  playerId: string;
  mmr?: number;
  scope: MatchmakingScope;
  playerData: Record<string, unknown>;
}

interface MatchmakingOut {
  type: 'queued' | 'match_found' | 'error';
  // ... fields based on type
}

export const matchmaking = api.streamInOut<MatchmakingIn, MatchmakingOut>(
  { path: "/matchmaking", expose: true },
  async (stream) => {
    let registration: QueueRegistration | null = null;

    try {
      for await (const msg of stream) {
        if (msg.type === 'join') {
          registration = await handleJoin(stream, msg);
        }
      }
    } finally {
      // Cleanup on disconnect
      if (registration) {
        await removeFromQueue(registration);
      }
    }
  }
);
```

#### Queue Operations

```typescript
// matchmaking/queue.ts
import { redis } from "../shared/redis";

interface QueueEntry {
  playerId: string;
  mmr: number;
  playerData: Record<string, unknown>;
  joinedAt: number;
  instanceId: string;
}

export async function addToQueue(
  scopeHash: string,
  entry: QueueEntry
): Promise<void> {
  const key = `queue:${scopeHash}`;
  await redis.zadd(key, entry.joinedAt, JSON.stringify(entry));

  // Store scope definition if not exists
  const scopeKey = `scope:${scopeHash}`;
  // ... store scope
}

export async function removeFromQueue(
  scopeHash: string,
  playerId: string
): Promise<void> {
  const key = `queue:${scopeHash}`;
  // Remove by playerId (need to scan, or use secondary index)
  // ...
}

export async function getQueueEntries(
  scopeHash: string
): Promise<QueueEntry[]> {
  const key = `queue:${scopeHash}`;
  const entries = await redis.zrangebyscore(key, '-inf', '+inf');
  return entries.map(e => JSON.parse(e));
}
```

#### Match Formation

```typescript
// matchmaking/matcher.ts

export async function tryFormMatch(
  scopeHash: string,
  scope: MatchmakingScope
): Promise<Match | null> {
  const entries = await getQueueEntries(scopeHash);
  if (entries.length === 0) return null;

  const now = Date.now();
  const oldestEntry = entries[0];
  const waitTime = now - oldestEntry.joinedAt;

  // Timeout reached - start with available players
  if (waitTime >= scope.waitTimeoutMs) {
    const players = entries.slice(0, scope.maxPlayers);
    if (players.length >= scope.minPlayersToStart) {
      return await createMatch(scopeHash, scope, players);
    }
  }

  // Enough players - sort by MMR and match
  if (entries.length >= scope.maxPlayers) {
    const sorted = sortByMmrProximity(entries, oldestEntry.mmr ?? 1000);
    const players = sorted.slice(0, scope.maxPlayers);
    return await createMatch(scopeHash, scope, players);
  }

  return null;
}

function sortByMmrProximity(
  entries: QueueEntry[],
  targetMmr: number
): QueueEntry[] {
  return [...entries].sort((a, b) => {
    const diffA = Math.abs((a.mmr ?? 1000) - targetMmr);
    const diffB = Math.abs((b.mmr ?? 1000) - targetMmr);
    return diffA - diffB;
  });
}

async function createMatch(
  scopeHash: string,
  scope: MatchmakingScope,
  players: QueueEntry[]
): Promise<Match> {
  const matchId = generateUUID();
  const seed: [number, number] = [
    Math.random() * Number.MAX_SAFE_INTEGER,
    Math.random() * Number.MAX_SAFE_INTEGER
  ];

  // Generate bot IDs for remaining slots
  const bots: string[] = [];
  const botsNeeded = scope.maxPlayers - players.length;
  for (let i = 0; i < botsNeeded; i++) {
    bots.push(UUID.generateMasked().asString());
  }

  // Assign slots
  const matchPlayers: MatchPlayer[] = [];
  let slot = 0;

  for (const player of players) {
    matchPlayers.push({
      playerId: player.playerId,
      slot: slot++,
      mmr: player.mmr,
      playerData: player.playerData,
      isBot: false,
    });
  }

  for (const botId of bots) {
    matchPlayers.push({
      playerId: botId,
      slot: slot++,
      mmr: undefined,
      playerData: null,
      isBot: true,
    });
  }

  // Store match in Redis
  await redis.hset(`match:${matchId}`, {
    scopeHash,
    seed0: seed[0].toString(),
    seed1: seed[1].toString(),
    startTime: Date.now().toString(),
    instanceId: INSTANCE_ID,
  });

  await redis.hset(`match:${matchId}:players`,
    Object.fromEntries(matchPlayers.map(p => [p.slot, JSON.stringify(p)]))
  );

  // Remove players from queue
  for (const player of players) {
    await removeFromQueue(scopeHash, player.playerId);
  }

  // Create MatchRoom instance
  const room = new MatchRoom(matchId, scope, seed, matchPlayers);
  matchRooms.set(matchId, room);

  return { matchId, room, players: matchPlayers };
}
```

#### Periodic Match Check

```typescript
// matchmaking/matcher.ts

const MATCH_CHECK_INTERVAL_MS = 500;

// Run on each instance
setInterval(async () => {
  // Get all active scope hashes
  const scopeHashes = await redis.smembers('active_scopes');

  for (const scopeHash of scopeHashes) {
    const scopeJson = await redis.get(`scope:${scopeHash}`);
    if (!scopeJson) continue;

    const scope = JSON.parse(scopeJson) as MatchmakingScope;
    const match = await tryFormMatch(scopeHash, scope);

    if (match) {
      // Notify players via their streams
      await notifyMatchFound(match);
    }
  }
}, MATCH_CHECK_INTERVAL_MS);
```

### Match Service

#### Endpoint: `/match/:matchId` (streamInOut)

```typescript
// match/match.ts
import { api } from "encore.dev/api";
import { Header } from "encore.dev/api";

interface MatchHandshake {
  matchId: string;
  token: Header<"Authorization">;
}

export const match = api.streamInOut<Uint8Array, Uint8Array, MatchHandshake>(
  { path: "/match/:matchId", expose: true },
  async (handshake, stream) => {
    // Validate JWT token
    const payload = verifyMatchToken(handshake.token);
    if (!payload || payload.matchId !== handshake.matchId) {
      stream.close();
      return;
    }

    const room = matchRooms.get(handshake.matchId);
    if (!room) {
      stream.close();
      return;
    }

    // Add player to room
    const connection = room.addPlayer(payload.playerId, stream);
    if (!connection) {
      stream.close();
      return;
    }

    // Send ServerHello
    const serverHello = room.createServerHello(connection.slot);
    stream.send(serverHello);

    // Start ping interval for this connection
    const pingInterval = startPingInterval(connection, stream);

    try {
      for await (const data of stream) {
        room.handleMessage(connection, data);
      }
    } finally {
      clearInterval(pingInterval);
      room.removePlayer(connection);

      // Cleanup if no players left
      if (room.playerCount === 0) {
        await cleanupMatch(room.matchId);
      }
    }
  }
);
```

#### MatchRoom Class

```typescript
// match/room.ts

export class MatchRoom {
  private _matchId: string;
  private _scope: MatchmakingScope;
  private _seed: [number, number];
  private _players: Map<string, PlayerConnection>;
  private _slots: Map<number, MatchPlayer>;
  private _startTime: number;
  private _tickMs: number;

  constructor(
    matchId: string,
    scope: MatchmakingScope,
    seed: [number, number],
    players: MatchPlayer[]
  ) {
    this._matchId = matchId;
    this._scope = scope;
    this._seed = seed;
    this._startTime = Date.now();
    this._tickMs = 1000 / scope.tickRate;
    this._players = new Map();
    this._slots = new Map();

    for (const player of players) {
      this._slots.set(player.slot, player);
    }
  }

  get matchId(): string { return this._matchId; }
  get playerCount(): number { return this._players.size; }

  get serverTick(): number {
    return Math.floor((Date.now() - this._startTime) / this._tickMs);
  }

  addPlayer(playerId: string, stream: Stream): PlayerConnection | null {
    // Find player's slot
    let playerSlot: number | null = null;
    for (const [slot, player] of this._slots) {
      if (player.playerId === playerId && !player.isBot) {
        playerSlot = slot;
        break;
      }
    }

    if (playerSlot === null) return null;

    const connection: PlayerConnection = {
      playerId,
      slot: playerSlot,
      stream,
      lastPingTime: Date.now(),
    };

    this._players.set(playerId, connection);
    return connection;
  }

  removePlayer(connection: PlayerConnection): void {
    this._players.delete(connection.playerId);
  }

  createServerHello(playerSlot: number): Uint8Array {
    // Use BinarySchemaPackPipeline to pack:
    // - Header
    // - ServerHelloStruct
    // - Players array
    // - Scope JSON
    // ...
  }

  handleMessage(connection: PlayerConnection, data: Uint8Array): void {
    const pipeline = new BinarySchemaUnpackPipeline(data);
    const header = pipeline.unpack(HeaderStruct);

    switch (header.type) {
      case MsgType.TickInput:
        this.handleTickInput(connection, pipeline);
        break;
      case MsgType.Ping:
        this.handlePing(connection, pipeline);
        break;
      case MsgType.PlayerFinishedGame:
        this.handlePlayerFinished(connection, pipeline);
        break;
    }
  }

  private handleTickInput(
    connection: PlayerConnection,
    pipeline: BinarySchemaUnpackPipeline
  ): void {
    const input = pipeline.unpack(TickInputStruct);
    const payload = pipeline.sliceRemaining();

    // Validate: correct player slot?
    if (input.playerSlot !== connection.slot) {
      return; // Ignore
    }

    const delta = input.tick - this.serverTick;

    // Too old
    if (delta < -this._scope.maxPastTicks) {
      this.sendCancelInput(connection, input.tick, input.seq, CancelReason.TooOld);
      return;
    }

    // Too far in future
    if (delta > this._scope.maxFutureTicks) {
      this.sendCancelInput(connection, input.tick, input.seq, CancelReason.TooFarFuture);
      return;
    }

    // Valid - broadcast to all
    this.broadcastTickInput(input, payload);
  }

  private broadcastTickInput(input: TickInputStruct, payload: Uint8Array): void {
    const fanout = packTickInputFanout([{ ...input, payload }]);

    for (const [, conn] of this._players) {
      conn.stream.send(fanout);
    }
  }

  private sendCancelInput(
    connection: PlayerConnection,
    tick: number,
    seq: number,
    reason: CancelReason
  ): void {
    const msg = packCancelInput({ tick, seq, reason });
    connection.stream.send(msg);
  }

  private handlePing(
    connection: PlayerConnection,
    pipeline: BinarySchemaUnpackPipeline
  ): void {
    const ping = pipeline.unpack(PingStruct);
    connection.lastPingTime = Date.now();

    const pong = packPong({
      cSend: ping.cSend,
      sRecv: Date.now(),
      sSend: Date.now(),
      sTick: this.serverTick,
    });

    connection.stream.send(pong);
  }

  private handlePlayerFinished(
    connection: PlayerConnection,
    pipeline: BinarySchemaUnpackPipeline
  ): void {
    // Handle early finish notification
    // Game-specific logic
  }
}
```

### JWT Token Handling

```typescript
// shared/jwt.ts
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const MATCH_TOKEN_TTL_MS = 10_000; // 10 seconds

interface MatchTokenPayload {
  playerId: string;
  matchId: string;
}

export function generateMatchToken(playerId: string, matchId: string): string {
  return jwt.sign(
    { playerId, matchId },
    JWT_SECRET,
    { expiresIn: Math.floor(MATCH_TOKEN_TTL_MS / 1000) }
  );
}

export function verifyMatchToken(token: string): MatchTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as MatchTokenPayload;
  } catch {
    return null;
  }
}

// For validating client JWT (playerId extraction)
interface ClientTokenPayload {
  playerId: string;
}

export function verifyClientToken(token: string): ClientTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as ClientTokenPayload;
  } catch {
    return null;
  }
}
```

### Redis Setup

```typescript
// shared/redis.ts
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL);

// For pub/sub (separate connection required)
export const redisSub = new Redis(REDIS_URL);
export const redisPub = new Redis(REDIS_URL);
```

### Queue Cleanup

```typescript
// matchmaking/cleanup.ts

const QUEUE_ENTRY_MAX_AGE_MS = 60_000; // 1 minute

// Periodic cleanup of stale queue entries
setInterval(async () => {
  const scopeHashes = await redis.smembers('active_scopes');
  const now = Date.now();
  const cutoff = now - QUEUE_ENTRY_MAX_AGE_MS;

  for (const scopeHash of scopeHashes) {
    const key = `queue:${scopeHash}`;
    // Remove entries older than cutoff
    await redis.zremrangebyscore(key, '-inf', cutoff);
  }
}, 30_000); // Run every 30 seconds
```

---

## Client Implementation

### Directory Structure (libs/net-wire additions)

```
libs/net-wire/src/lib/
├── protocol.ts                  # Existing binary protocol
├── clock-sync.ts                # Existing clock synchronization
├── input-delay-controller.ts    # Existing input delay adaptation
├── types.ts                     # NEW: Shared types
├── matchmaking-client.ts        # NEW: Matchmaking WebSocket client
├── match-connection.ts          # NEW: Match WebSocket connection
└── relay-input-provider.ts      # NEW: Network input provider
```

### Types

```typescript
// libs/net-wire/src/lib/types.ts

export interface MatchmakingScope {
  gameType: string;
  tickRate: number;
  maxPlayers: number;
  minPlayersToStart: number;
  waitTimeoutMs: number;
  maxPastTicks: number;
  maxFutureTicks: number;
  mmrRange?: number;
  gameConfig?: Record<string, unknown>;
}

export interface PlayerInfo {
  playerId: Uint8Array;  // 16 bytes UUID
  slot: number;
  playerData: Record<string, unknown> | null;
}

export interface ServerHelloData {
  seed: [number, number];
  playerSlot: number;
  serverTick: number;
  players: PlayerInfo[];
  scope: MatchmakingScope;
}

export interface MatchFoundData {
  matchId: string;
  token: string;
}

export enum CancelReason {
  TooOld = 0,
  TooFarFuture = 1,
  InvalidPlayer = 2,
}
```

### MatchmakingClient

```typescript
// libs/net-wire/src/lib/matchmaking-client.ts

export interface MatchmakingClientConfig {
  serverUrl: string;        // e.g., "wss://api.game.com"
  playerId: string;
  authToken: string;        // Client JWT
}

export interface JoinOptions {
  mmr?: number;
  scope: MatchmakingScope;
  playerData: Record<string, unknown>;
}

export class MatchmakingClient {
  private _config: MatchmakingClientConfig;
  private _ws: WebSocket | null = null;
  private _onMatchFound: ((data: MatchFoundData) => void) | null = null;
  private _onQueueStatus: ((position: number, total: number) => void) | null = null;
  private _onError: ((error: Error) => void) | null = null;

  constructor(config: MatchmakingClientConfig) {
    this._config = config;
  }

  public onMatchFound(callback: (data: MatchFoundData) => void): this {
    this._onMatchFound = callback;
    return this;
  }

  public onQueueStatus(callback: (position: number, total: number) => void): this {
    this._onQueueStatus = callback;
    return this;
  }

  public onError(callback: (error: Error) => void): this {
    this._onError = callback;
    return this;
  }

  public join(options: JoinOptions): void {
    const url = `${this._config.serverUrl}/matchmaking`;
    this._ws = new WebSocket(url);

    this._ws.onopen = () => {
      this._ws!.send(JSON.stringify({
        type: 'join',
        playerId: this._config.playerId,
        mmr: options.mmr,
        scope: options.scope,
        playerData: options.playerData,
      }));
    };

    this._ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'queued':
          this._onQueueStatus?.(msg.position, msg.playersInQueue);
          break;
        case 'match_found':
          this._onMatchFound?.({ matchId: msg.matchId, token: msg.token });
          this.disconnect();
          break;
        case 'error':
          this._onError?.(new Error(msg.message));
          break;
      }
    };

    this._ws.onerror = (event) => {
      this._onError?.(new Error('WebSocket error'));
    };

    this._ws.onclose = () => {
      // Cleanup
    };
  }

  public disconnect(): void {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }
}
```

### MatchConnection

```typescript
// libs/net-wire/src/lib/match-connection.ts

export interface MatchConnectionConfig {
  serverUrl: string;
  matchId: string;
  token: string;
}

export class MatchConnection {
  private _config: MatchConnectionConfig;
  private _ws: WebSocket | null = null;
  private _clockSync: ClockSync;
  private _onServerHello: ((data: ServerHelloData) => void) | null = null;
  private _onTickInputFanout: ((inputs: TickInput[]) => void) | null = null;
  private _onCancelInput: ((tick: number, seq: number, reason: CancelReason) => void) | null = null;
  private _pingInterval: number | null = null;

  constructor(config: MatchConnectionConfig) {
    this._config = config;
    this._clockSync = new ClockSync();
  }

  get clockSync(): ClockSync {
    return this._clockSync;
  }

  public onServerHello(callback: (data: ServerHelloData) => void): this {
    this._onServerHello = callback;
    return this;
  }

  public onTickInputFanout(callback: (inputs: TickInput[]) => void): this {
    this._onTickInputFanout = callback;
    return this;
  }

  public onCancelInput(callback: (tick: number, seq: number, reason: CancelReason) => void): this {
    this._onCancelInput = callback;
    return this;
  }

  public connect(): void {
    const url = `${this._config.serverUrl}/match/${this._config.matchId}?token=${this._config.token}`;
    this._ws = new WebSocket(url);
    this._ws.binaryType = 'arraybuffer';

    this._ws.onopen = () => {
      this.startPingInterval();
    };

    this._ws.onmessage = (event) => {
      const data = new Uint8Array(event.data);
      this.handleMessage(data);
    };

    this._ws.onclose = () => {
      this.stopPingInterval();
    };
  }

  public disconnect(): void {
    this.stopPingInterval();
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  public sendTickInput(tick: number, playerSlot: number, seq: number, payload: Uint8Array): void {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;

    const msg = packTickInput({ tick, playerSlot, kind: 0, seq }, payload);
    this._ws.send(msg);
  }

  private handleMessage(data: Uint8Array): void {
    const pipeline = new BinarySchemaUnpackPipeline(data);
    const header = pipeline.unpack(HeaderStruct);

    switch (header.type) {
      case MsgType.ServerHello:
        this.handleServerHello(pipeline);
        break;
      case MsgType.TickInputFanout:
        this.handleTickInputFanout(pipeline);
        break;
      case MsgType.CancelInput:
        this.handleCancelInput(pipeline);
        break;
      case MsgType.Pong:
        this.handlePong(pipeline);
        break;
    }
  }

  private handleServerHello(pipeline: BinarySchemaUnpackPipeline): void {
    // Unpack ServerHello struct
    // Unpack players array
    // Unpack scope JSON
    // Call callback
  }

  private handleTickInputFanout(pipeline: BinarySchemaUnpackPipeline): void {
    const fanout = pipeline.unpack(TickInputFanoutStruct);
    const inputs: TickInput[] = [];

    for (let i = 0; i < fanout.inputCount; i++) {
      const input = pipeline.unpack(TickInputStruct);
      const payload = pipeline.sliceBytes(/* payload length */);
      inputs.push({ ...input, payload });
    }

    this._onTickInputFanout?.(inputs);
  }

  private handleCancelInput(pipeline: BinarySchemaUnpackPipeline): void {
    const cancel = pipeline.unpack(CancelInputStruct);
    this._onCancelInput?.(cancel.tick, cancel.seq, cancel.reason);
  }

  private handlePong(pipeline: BinarySchemaUnpackPipeline): void {
    const pong = pipeline.unpack(PongStruct);
    const clientReceiveTime = performance.now();

    this._clockSync.addSample(
      pong.cSend,
      pong.sRecv,
      pong.sSend,
      clientReceiveTime
    );
  }

  private startPingInterval(): void {
    // Fast pings during warmup
    let pingCount = 0;

    const sendPing = () => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;

      const ping = packPing({ cSend: performance.now() });
      this._ws.send(ping);
      pingCount++;

      // Adjust interval after warmup
      if (pingCount === PING_WARMUP_COUNT) {
        this.stopPingInterval();
        this._pingInterval = window.setInterval(sendPing, PING_STEADY_INTERVAL_MS);
      }
    };

    this._pingInterval = window.setInterval(sendPing, PING_WARMUP_INTERVAL_MS);
    sendPing(); // Send immediately
  }

  private stopPingInterval(): void {
    if (this._pingInterval !== null) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }
}
```

### RelayInputProvider

```typescript
// libs/net-wire/src/lib/relay-input-provider.ts

import { AbstractInputProvider, RPC } from '@lagless/core';

export class RelayInputProvider extends AbstractInputProvider {
  private _matchConnection: MatchConnection;
  private _inputDelayController: InputDelayController;
  private _playerSlot: number;
  private _invalidateRollbackTick: number = Infinity;
  private _cancelledInputs: Set<string> = new Set(); // "tick:seq"

  constructor(
    inputRegistry: InputRegistry,
    matchConnection: MatchConnection,
    playerSlot: number,
    config: {
      tickRate: number;
      initialInputDelayTicks?: number;
      minInputDelayTicks?: number;
      maxInputDelayTicks?: number;
    }
  ) {
    super(inputRegistry, config);
    this._matchConnection = matchConnection;
    this._playerSlot = playerSlot;
    this._inputDelayController = new InputDelayController({
      tickMs: 1000 / config.tickRate,
      minDelay: config.minInputDelayTicks ?? 1,
      maxDelay: config.maxInputDelayTicks ?? 8,
    });

    // Subscribe to events
    matchConnection.onTickInputFanout((inputs) => {
      this.handleTickInputFanout(inputs);
    });

    matchConnection.onCancelInput((tick, seq, reason) => {
      this.handleCancelInput(tick, seq, reason);
    });
  }

  public override drainInputs(
    callback: (addRpc: <T>(inputType: InputType<T>, data: T) => void) => void
  ): void {
    callback(<T>(inputType: InputType<T>, data: T) => {
      const currentTick = this.getCurrentTick();
      const inputDelay = this._inputDelayController.getDelay(
        this._matchConnection.clockSync
      );
      const targetTick = currentTick + inputDelay;
      const seq = this.getNextSeq();

      // Create RPC
      const rpc = this.createRpc(inputType, data, targetTick, seq, this._playerSlot);

      // Add locally for prediction
      this.addToHistory(rpc);

      // Send to server
      const payload = this.packInputPayload(inputType, data);
      this._matchConnection.sendTickInput(targetTick, this._playerSlot, seq, payload);
    });
  }

  public override getInvalidateRollbackTick(): number {
    const tick = this._invalidateRollbackTick;
    this._invalidateRollbackTick = Infinity;
    return tick;
  }

  private handleTickInputFanout(inputs: TickInput[]): void {
    const currentTick = this.getCurrentTick();

    for (const input of inputs) {
      // Skip our own inputs (already in history from prediction)
      if (input.playerSlot === this._playerSlot) {
        // But verify it matches what we sent
        continue;
      }

      // Add remote input to history
      const rpc = this.unpackRpc(input);
      this.addToHistory(rpc);

      // Check if rollback needed
      if (input.tick < currentTick) {
        this._invalidateRollbackTick = Math.min(
          this._invalidateRollbackTick,
          input.tick
        );
      }
    }
  }

  private handleCancelInput(tick: number, seq: number, reason: CancelReason): void {
    // Mark input as cancelled
    this._cancelledInputs.add(`${tick}:${seq}`);

    // Remove from history
    this.removeFromHistory(tick, seq);

    // Trigger rollback to before this tick
    this._invalidateRollbackTick = Math.min(
      this._invalidateRollbackTick,
      tick
    );
  }

  // Called by simulation to check if input was cancelled
  public isInputCancelled(tick: number, seq: number): boolean {
    return this._cancelledInputs.has(`${tick}:${seq}`);
  }

  // Update input delay based on network conditions
  public updateInputDelay(): void {
    this._inputDelayController.update(this._matchConnection.clockSync);
  }
}
```

---

## Integration with Circle Sumo

### Updated Runner Provider

```typescript
// circle-sumo/circle-sumo-game/src/app/game-view/multiplayer-provider.tsx

import { MatchmakingClient, MatchConnection, RelayInputProvider } from '@lagless/net-wire';

interface MultiplayerContextValue {
  state: 'idle' | 'matchmaking' | 'connecting' | 'playing';
  join: (options: JoinOptions) => void;
  leave: () => void;
  runner: CircleSumoRunner | null;
  queuePosition: number | null;
  error: Error | null;
}

export function MultiplayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MultiplayerContextValue['state']>('idle');
  const [runner, setRunner] = useState<CircleSumoRunner | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const matchmakingClient = useRef<MatchmakingClient | null>(null);
  const matchConnection = useRef<MatchConnection | null>(null);

  const join = useCallback((options: JoinOptions) => {
    setState('matchmaking');

    matchmakingClient.current = new MatchmakingClient({
      serverUrl: import.meta.env.VITE_SERVER_URL,
      playerId: getPlayerId(),
      authToken: getAuthToken(),
    });

    matchmakingClient.current
      .onQueueStatus((position, total) => {
        setQueuePosition(position);
      })
      .onMatchFound(async (data) => {
        setState('connecting');
        setQueuePosition(null);
        await connectToMatch(data, options.scope);
      })
      .onError((err) => {
        setError(err);
        setState('idle');
      })
      .join(options);
  }, []);

  const connectToMatch = async (
    matchData: MatchFoundData,
    scope: MatchmakingScope
  ) => {
    matchConnection.current = new MatchConnection({
      serverUrl: import.meta.env.VITE_SERVER_URL,
      matchId: matchData.matchId,
      token: matchData.token,
    });

    matchConnection.current
      .onServerHello((hello) => {
        // Create ECS config from scope
        const ecsConfig = new ECSConfig({
          tickRate: hello.scope.tickRate,
          seed: hello.seed,
          maxEntities: 100,
          // ... other config
        });

        // Create input provider
        const inputProvider = new RelayInputProvider(
          CircleSumoInputRegistry,
          matchConnection.current!,
          hello.playerSlot,
          {
            tickRate: hello.scope.tickRate,
          }
        );

        // Create runner
        const newRunner = new CircleSumoRunner(
          ecsConfig,
          inputProvider,
          CircleSumoSystems,
          CircleSumoSignals
        );

        // Initialize players from ServerHello
        for (const player of hello.players) {
          const isBot = UUID.isMaskedUint8(player.playerId);

          // Add PlayerJoined RPC for each player
          inputProvider.addRemoteRpc(
            PlayerJoined,
            {
              playerId: player.playerId,
              skinId: isBot
                ? newRunner.Mem.prng.nextInRange(0, MAX_SKIN_ID)
                : player.playerData?.skinId ?? 0,
            },
            hello.serverTick
          );
        }

        // Sync clock
        newRunner.Simulation.setTick(hello.serverTick);

        newRunner.start();
        setRunner(newRunner);
        setState('playing');
      })
      .connect();
  };

  const leave = useCallback(() => {
    matchmakingClient.current?.disconnect();
    matchConnection.current?.disconnect();
    runner?.stop();

    matchmakingClient.current = null;
    matchConnection.current = null;
    setRunner(null);
    setState('idle');
    setQueuePosition(null);
    setError(null);
  }, [runner]);

  // ...
}
```

### MatchmakingScope for Circle Sumo

```typescript
// circle-sumo/circle-sumo-game/src/config/matchmaking-scope.ts

export const CIRCLE_SUMO_SCOPE: MatchmakingScope = {
  gameType: 'circle-sumo',
  tickRate: 60,
  maxPlayers: 4,
  minPlayersToStart: 1,
  waitTimeoutMs: 7000,
  maxPastTicks: 30,
  maxFutureTicks: 10,
  gameConfig: {
    arenaRadius: 500,
  },
};
```

---

## Constants and Configuration

### Timing Constants

```typescript
// libs/net-wire/src/lib/constants.ts

// Ping intervals
export const PING_WARMUP_INTERVAL_MS = 100;
export const PING_WARMUP_COUNT = 5;
export const PING_STEADY_INTERVAL_MS = 500;

// Clock sync
export const CLOCK_SYNC_EWMA_ALPHA = 0.15;

// Input delay
export const DEFAULT_INPUT_DELAY_TICKS = 2;
export const MIN_INPUT_DELAY_TICKS = 1;
export const MAX_INPUT_DELAY_TICKS = 8;
export const INPUT_DELAY_JITTER_MULTIPLIER = 1.8;
export const INPUT_DELAY_SAFETY_MS = 10;
```

### Server Constants

```typescript
// apps/server/shared/constants.ts

// JWT
export const MATCH_TOKEN_TTL_MS = 10_000;  // 10 seconds

// Matchmaking
export const MATCH_CHECK_INTERVAL_MS = 500;
export const QUEUE_ENTRY_MAX_AGE_MS = 60_000;  // 1 minute cleanup

// Instance
export const INSTANCE_ID = process.env.INSTANCE_ID || crypto.randomUUID();
```

### Environment Variables

```bash
# Server
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
INSTANCE_ID=server-1
PORT=8080

# Client
VITE_SERVER_URL=wss://api.game.com
```

---

## Implementation Order

### Phase 1: Shared Types and Protocol (libs/net-wire)

1. Add `types.ts` with MatchmakingScope, PlayerInfo, etc.
2. Update `protocol.ts` with new binary schemas (ServerHello update, CancelInput)
3. Add message packing/unpacking functions
4. Export all new types from index

### Phase 2: Server Setup (apps/server)

1. Initialize Encore.ts project with Nx integration
2. Setup Redis connection (ioredis)
3. Implement JWT utilities
4. Create shared types and config

### Phase 3: Server Matchmaking

1. Implement queue operations (add, remove, get)
2. Implement match formation logic
3. Create `/matchmaking` streamInOut endpoint
4. Add periodic match check interval
5. Add queue cleanup for stale entries

### Phase 4: Server Match

1. Implement MatchRoom class
2. Implement server clock
3. Implement input validation
4. Create `/match/:id` streamInOut endpoint
5. Handle ServerHello, TickInput, Ping/Pong, CancelInput

### Phase 5: Client Matchmaking (libs/net-wire)

1. Implement MatchmakingClient
2. Handle join, queue status, match found events
3. Handle disconnect cleanup

### Phase 6: Client Match Connection (libs/net-wire)

1. Implement MatchConnection
2. Implement binary message handling
3. Integrate with existing ClockSync
4. Handle ServerHello, TickInputFanout, CancelInput, Pong

### Phase 7: RelayInputProvider (libs/net-wire)

1. Extend AbstractInputProvider
2. Implement drainInputs with network sending
3. Implement rollback tick tracking
4. Handle cancelled inputs
5. Integrate InputDelayController

### Phase 8: Circle Sumo Integration

1. Create MultiplayerProvider context
2. Update game initialization to use RelayInputProvider
3. Handle ServerHello player initialization
4. Create matchmaking UI (queue status, errors)
5. Test full flow

### Phase 9: Testing and Polish

1. Test with simulated latency
2. Test rollback scenarios
3. Test disconnect/reconnect edge cases
4. Optimize binary message sizes
5. Add logging and monitoring

---

## Future Enhancements (Not in Current Scope)

- **Reconnect/Late Join**: Allow players to rejoin after disconnect
- **Cross-instance Pub/Sub**: Scale to multiple server instances
- **Spectator Mode**: Watch ongoing matches
- **Match History**: Store and replay matches
- **Anti-Cheat**: Server-side simulation for validation
- **Regional Matchmaking**: Match players by geographic proximity


Изучи текущий фреймворк, в репозитории которого ты находишься, я хочу расширить его функционал и добавить мультиплеер через relay server, так-то мой фреймфорк архитектурно поддерживает мультиплеер, но       
нужна реализация. Так же изучи план реализации 
