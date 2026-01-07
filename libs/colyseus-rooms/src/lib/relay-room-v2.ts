// libs/colyseus-rooms/src/lib/relay-room-v2.ts

import { Client } from 'colyseus';
import {
  BinarySchemaPackPipeline,
  BinarySchemaUnpackPipeline,
  packBatchBuffers,
} from '@lagless/binary';
import {
  HeaderStruct,
  MsgType,
  RELAY_BYTES_CHANNEL,
  ServerHelloV2Struct,
  SnapshotRequestStruct,
  SnapshotResponseStruct,
  LateJoinBundleHeaderStruct,
  RoomClosingStruct,
  StateHashStruct,
  WireVersion,
  RoomCloseReason,
  TickInputFanoutStruct,
} from '@lagless/net-wire';

import {
  RelayColyseusRoom,
  RelayRoomOptions,
  PlayerInfo,
} from './relay-colyseus-room.js';
import {
  SnapshotCollector,
  SnapshotCollectorConfig,
  DEFAULT_SNAPSHOT_COLLECTOR_CONFIG,
  type SnapshotCollectionSuccess,
  type SnapshotCollectionFailure,
} from './snapshot-collector.js';
import {
  ConnectionTracker,
  ConnectionTrackerConfig,
  DEFAULT_CONNECTION_TRACKER_CONFIG,
} from './connection-tracker.js';

/**
 * Extended options for V2 relay room
 */
export interface RelayRoomV2Options extends RelayRoomOptions {
  /** Enable snapshot voting for late joiners (default: true) */
  readonly enableSnapshotVoting?: boolean;
  /** Snapshot collection timeout in ms (default: 3000) */
  readonly snapshotTimeoutMs?: number;
  /** Number of snapshot collection retries (default: 1) */
  readonly snapshotRetryCount?: number;
  /** Reconnection grace period in ms (default: 30000) */
  readonly rejoinGracePeriodMs?: number;
  /** Minimum players required for snapshot voting (default: 2) */
  readonly minSnapshotVoters?: number;
}

/**
 * V2 Relay Room with snapshot voting and reconnection support
 *
 * New features:
 * - Late-join via majority-voted client snapshots
 * - Reconnection within grace period
 * - Extended protocol with ServerHelloV2, SnapshotRequest, LateJoinBundle, RoomClosing
 * - State hash exchange for desync detection
 */
export abstract class RelayColyseusRoomV2 extends RelayColyseusRoom {
  protected _snapshotCollector!: SnapshotCollector;
  protected _connectionTracker!: ConnectionTracker;

  protected _enableSnapshotVoting = true;
  protected _minSnapshotVoters = 2;

  /** Clients waiting for snapshot during late join */
  private readonly _pendingLateJoiners = new Map<string, {
    client: Client;
    playerSlot: number;
    requestId?: number;
  }>();

  public override async onCreate(options: RelayRoomV2Options): Promise<void> {
    await super.onCreate(options);

    this._enableSnapshotVoting = options.enableSnapshotVoting ?? true;
    this._minSnapshotVoters = options.minSnapshotVoters ?? 2;

    // Initialize snapshot collector
    const snapshotConfig: Partial<SnapshotCollectorConfig> = {
      timeoutMs: options.snapshotTimeoutMs ?? DEFAULT_SNAPSHOT_COLLECTOR_CONFIG.timeoutMs,
      retryCount: options.snapshotRetryCount ?? DEFAULT_SNAPSHOT_COLLECTOR_CONFIG.retryCount,
    };

    this._snapshotCollector = new SnapshotCollector(
      snapshotConfig,
      this.handleSnapshotSuccess.bind(this),
      this.handleSnapshotFailure.bind(this),
      this.broadcastSnapshotRequest.bind(this)
    );

    // Initialize connection tracker
    const connectionConfig: Partial<ConnectionTrackerConfig> = {
      rejoinGracePeriodMs: options.rejoinGracePeriodMs ?? DEFAULT_CONNECTION_TRACKER_CONFIG.rejoinGracePeriodMs,
    };

    this._connectionTracker = new ConnectionTracker(connectionConfig);

    console.log(`[RelayRoomV2] Created with snapshot voting: ${this._enableSnapshotVoting}`);
  }

  public override onJoin(client: Client): void {
    const currentTick = this.serverTick;

    // Check for rejoin
    const playerId = client.auth?.playerId;
    if (playerId) {
      const rejoinResult = this._connectionTracker.attemptRejoin(playerId, Date.now());

      if (rejoinResult.success && rejoinResult.playerSlot !== undefined) {
        // Successful rejoin - restore player to their slot
        this.handleRejoin(client, rejoinResult.playerSlot, currentTick);
        return;
      }
    }

    // New player - assign next slot
    const playerSlot = this._nextPlayerSlot++;

    // Send V2 server hello
    this.sendServerHelloV2(client, playerSlot, currentTick);

    // Register player
    const playerInfo: PlayerInfo = {
      playerSlot,
      playerId: client.auth?.playerId,
      displayName: client.auth?.displayName,
      connectedAt: Date.now(),
      isConnected: true,
      joinedAtTick: currentTick,
    };

    this._sessionIdToPlayerSlot.set(client.sessionId, playerSlot);
    this._players.set(client.sessionId, playerInfo);
    this._playerSlotToClient.set(playerSlot, client);

    // Track connection
    if (playerId) {
      this._connectionTracker.recordConnect(playerId, playerSlot);
    }

    // Check if this is a late joiner
    const isLateJoiner = this._isGameStarted && this.getEligibleSnapshotProviders(playerSlot).size > 0;

    if (isLateJoiner && this._enableSnapshotVoting) {
      // Initiate snapshot voting for late joiner
      this.initiateSnapshotVoting(client, playerSlot, currentTick);
    } else {
      // Send buffered inputs (V1 fallback or game not started)
      this.sendBufferedInputsToClient(client, playerInfo);

      // Notify subclass
      this.onPlayerJoined(this._gameId, playerInfo).catch(err => {
        console.error(`[RelayRoomV2] onPlayerJoined error:`, err);
      });
    }

    console.log(`[RelayRoomV2] Player ${playerSlot} joined at tick ${currentTick} (late: ${isLateJoiner})`);
  }

  public override async onLeave(client: Client, consented: boolean): Promise<void> {
    const playerInfo = this._players.get(client.sessionId);

    if (playerInfo) {
      playerInfo.isConnected = false;

      // Record disconnect for potential rejoin
      const playerId = playerInfo.playerId;
      if (playerId && !consented) {
        // Non-consented leave - allow rejoin
        this._connectionTracker.recordDisconnect(
          playerInfo.playerSlot,
          client.sessionId,
          playerId,
          playerInfo.displayName
        );
      } else if (playerId) {
        // Consented leave - expire immediately
        this._connectionTracker.forceExpire(playerId);
      }

      await this.onPlayerLeave(this._gameId, playerInfo).catch(err => {
        console.error(`[RelayRoomV2] onPlayerLeave error:`, err);
      });
    }

    // Cancel any pending snapshot requests for this client
    this._snapshotCollector.cancelRequestsForSession(client.sessionId);
    this._pendingLateJoiners.delete(client.sessionId);

    console.log(`[RelayRoomV2] Player left (consented: ${consented})`);
  }

  public override async onDispose(): Promise<void> {
    // Broadcast room closing to all clients
    this.broadcastRoomClosing(RoomCloseReason.AllFinished);

    await super.onDispose();

    this._connectionTracker.clear();
  }

  /**
   * Override to handle V2 message types
   */
  protected override onUnknownMessage(
    client: Client,
    type: number,
    pipeline: BinarySchemaUnpackPipeline
  ): void {
    switch (type) {
      case MsgType.SnapshotResponse:
        this.handleSnapshotResponse(client, pipeline);
        break;
      case MsgType.StateHash:
        this.handleStateHash(client, pipeline);
        break;
      default:
        super.onUnknownMessage(client, type, pipeline);
    }
  }

  /**
   * Override tick processing to include V2 features
   */
  protected override onAfterTick(serverTick: number): void {
    super.onAfterTick(serverTick);

    // Tick snapshot collector (check timeouts)
    this._snapshotCollector.tick(Date.now());

    // Tick connection tracker (cleanup expired)
    this._connectionTracker.tick(Date.now());
  }

  /**
   * Handle a player rejoining after disconnect
   */
  private handleRejoin(client: Client, playerSlot: number, currentTick: number): void {
    const playerId = client.auth?.playerId;
    if (!playerId) {
      console.error(`[RelayRoomV2] Rejoin without playerId`);
      return;
    }

    // Confirm rejoin in tracker
    this._connectionTracker.confirmRejoin(playerId, playerSlot);

    // Send V2 server hello
    this.sendServerHelloV2(client, playerSlot, currentTick);

    // Update player mappings
    // Find and update existing player info
    let playerInfo: PlayerInfo | undefined;
    for (const [sessionId, info] of this._players) {
      if (info.playerSlot === playerSlot) {
        // Remove old session mapping
        this._sessionIdToPlayerSlot.delete(sessionId);
        playerInfo = info;
        this._players.delete(sessionId);
        break;
      }
    }

    if (!playerInfo) {
      console.error(`[RelayRoomV2] Player info not found for rejoin slot ${playerSlot}`);
      return;
    }

    // Update with new session
    playerInfo.isConnected = true;
    this._sessionIdToPlayerSlot.set(client.sessionId, playerSlot);
    this._players.set(client.sessionId, playerInfo);
    this._playerSlotToClient.set(playerSlot, client);

    // Initiate snapshot voting for rejoiner (they need current state)
    if (this._enableSnapshotVoting && this.getEligibleSnapshotProviders(playerSlot).size >= this._minSnapshotVoters) {
      this.initiateSnapshotVoting(client, playerSlot, currentTick);
    } else {
      // Fallback: send buffered inputs
      this.sendBufferedInputsToClient(client, playerInfo);
    }

    console.log(`[RelayRoomV2] Player ${playerSlot} rejoined at tick ${currentTick}`);
  }

  /**
   * Initiate snapshot voting for a late joiner
   */
  private initiateSnapshotVoting(client: Client, playerSlot: number, currentTick: number): void {
    const eligibleSlots = this.getEligibleSnapshotProviders(playerSlot);

    if (eligibleSlots.size < this._minSnapshotVoters) {
      console.log(`[RelayRoomV2] Not enough voters (${eligibleSlots.size}), using fallback`);
      const playerInfo = this._players.get(client.sessionId);
      if (playerInfo) {
        this.sendBufferedInputsToClient(client, playerInfo);
        this.onPlayerJoined(this._gameId, playerInfo).catch(console.error);
      }
      return;
    }

    // Calculate tick range: last 60 ticks (1 second at 60fps)
    const targetTickMax = Math.max(0, currentTick - 2); // Small buffer
    const targetTickMin = Math.max(0, targetTickMax - 60);

    // Track pending late joiner
    this._pendingLateJoiners.set(client.sessionId, {
      client,
      playerSlot,
    });

    // Start collection
    const requestId = this._snapshotCollector.initiateRequest(
      client.sessionId,
      playerSlot,
      targetTickMin,
      targetTickMax,
      eligibleSlots
    );

    // Update tracking with request ID
    const pending = this._pendingLateJoiners.get(client.sessionId);
    if (pending) {
      pending.requestId = requestId;
    }

    console.log(`[RelayRoomV2] Initiated snapshot voting for player ${playerSlot} (request ${requestId})`);
  }

  /**
   * Get set of player slots eligible to provide snapshots
   * Excludes the late joiner and any disconnected players
   */
  private getEligibleSnapshotProviders(excludeSlot: number): Set<number> {
    const eligible = new Set<number>();

    for (const playerInfo of this._players.values()) {
      if (playerInfo.isConnected && playerInfo.playerSlot !== excludeSlot) {
        eligible.add(playerInfo.playerSlot);
      }
    }

    return eligible;
  }

  /**
   * Broadcast snapshot request to eligible players
   */
  private broadcastSnapshotRequest(
    requestId: number,
    targetTickMin: number,
    targetTickMax: number,
    eligibleSlots: ReadonlySet<number>
  ): void {
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.SnapshotRequest });
    pipeline.pack(SnapshotRequestStruct, {
      requestId,
      targetTickMin,
      targetTickMax,
    });

    const message = pipeline.toUint8Array();

    for (const slot of eligibleSlots) {
      const client = this._playerSlotToClient.get(slot);
      if (client) {
        client.send(RELAY_BYTES_CHANNEL, message);
      }
    }

    console.log(`[RelayRoomV2] Broadcast snapshot request ${requestId} to ${eligibleSlots.size} players`);
  }

  /**
   * Handle snapshot response from a client
   */
  private handleSnapshotResponse(client: Client, pipeline: BinarySchemaUnpackPipeline): void {
    const playerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (playerSlot === undefined) {
      console.warn(`[RelayRoomV2] Snapshot response from unknown client`);
      return;
    }

    const response = pipeline.unpack(SnapshotResponseStruct);
    const snapshotBytes = pipeline.sliceRemaining();

    // Validate size matches header
    if (snapshotBytes.byteLength !== response.snapshotSize) {
      console.warn(
        `[RelayRoomV2] Snapshot size mismatch: expected ${response.snapshotSize}, got ${snapshotBytes.byteLength}`
      );
      return;
    }

    this._snapshotCollector.handleResponse(
      playerSlot,
      response.requestId,
      response.snapshotTick,
      response.hash32,
      snapshotBytes
    );
  }

  /**
   * Handle successful snapshot collection
   */
  private handleSnapshotSuccess(result: SnapshotCollectionSuccess): void {
    const pending = this._pendingLateJoiners.get(result.lateJoinerSessionId);
    if (!pending) {
      console.warn(`[RelayRoomV2] Snapshot success for unknown late joiner`);
      return;
    }

    // Log offenders if any
    if (result.offenderSlots.length > 0) {
      console.warn(`[RelayRoomV2] Snapshot offenders detected: ${result.offenderSlots.join(', ')}`);
      // TODO: Track offenders for future reference
    }

    // Send late join bundle
    this.sendLateJoinBundle(
      pending.client,
      result.snapshot,
      result.tick,
      result.hash32
    );

    // Cleanup pending
    this._pendingLateJoiners.delete(result.lateJoinerSessionId);

    // Notify subclass
    const playerInfo = this._players.get(result.lateJoinerSessionId);
    if (playerInfo) {
      this.onPlayerJoined(this._gameId, playerInfo).catch(err => {
        console.error(`[RelayRoomV2] onPlayerJoined error:`, err);
      });
    }

    console.log(
      `[RelayRoomV2] Snapshot voting succeeded for player ${result.lateJoinerSlot} at tick ${result.tick}`
    );
  }

  /**
   * Handle failed snapshot collection
   */
  private handleSnapshotFailure(result: SnapshotCollectionFailure): void {
    const pending = this._pendingLateJoiners.get(result.lateJoinerSessionId);
    if (!pending) {
      return;
    }

    console.warn(`[RelayRoomV2] Snapshot voting failed: ${result.reason}`);

    // Fallback to buffered inputs
    const playerInfo = this._players.get(result.lateJoinerSessionId);
    if (playerInfo) {
      this.sendBufferedInputsToClient(pending.client, playerInfo);

      // Notify subclass
      this.onPlayerJoined(this._gameId, playerInfo).catch(err => {
        console.error(`[RelayRoomV2] onPlayerJoined error:`, err);
      });
    }

    this._pendingLateJoiners.delete(result.lateJoinerSessionId);
  }

  /**
   * Handle state hash from client (for desync detection)
   */
  private handleStateHash(client: Client, pipeline: BinarySchemaUnpackPipeline): void {
    const playerSlot = this._sessionIdToPlayerSlot.get(client.sessionId);
    if (playerSlot === undefined) return;

    const stateHash = pipeline.unpack(StateHashStruct);

    // Log for debugging - could be extended to detect desyncs
    console.debug(
      `[RelayRoomV2] State hash from player ${playerSlot}: tick=${stateHash.tick}, hash=${stateHash.hash32}`
    );

    // TODO: Implement desync detection by comparing hashes from multiple clients
  }

  /**
   * Send V2 server hello to client
   */
  private sendServerHelloV2(client: Client, playerSlot: number, serverTick: number): void {
    const { seed0, seed1 } = this.getGameSeeds();

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.ServerHello });
    pipeline.pack(ServerHelloV2Struct, {
      seed0,
      seed1,
      playerSlot,
      serverTick,
      maxPlayers: this.maxClients,
    });

    client.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  /**
   * Send late join bundle to client
   */
  private sendLateJoinBundle(
    client: Client,
    snapshot: ArrayBuffer,
    snapshotTick: number,
    snapshotHash: number
  ): void {
    // Get inputs from snapshotTick+1 to current tick
    const inputs = this['_inputBuffer'].getFlattenedFromTick(snapshotTick + 1);

    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.LateJoinBundle });
    pipeline.pack(LateJoinBundleHeaderStruct, {
      snapshotTick,
      snapshotHash,
      snapshotSize: snapshot.byteLength,
      inputCount: inputs.length,
    });

    // Append snapshot bytes
    pipeline.appendBuffer(snapshot);

    // Append input buffers
    if (inputs.length > 0) {
      pipeline.appendBuffer(packBatchBuffers(inputs));
    }

    client.send(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());

    console.log(
      `[RelayRoomV2] Sent late join bundle: snapshot@${snapshotTick} + ${inputs.length} inputs`
    );
  }

  /**
   * Broadcast room closing message to all clients
   */
  protected broadcastRoomClosing(reason: RoomCloseReason): void {
    const pipeline = new BinarySchemaPackPipeline();
    pipeline.pack(HeaderStruct, { version: WireVersion.V2, type: MsgType.RoomClosing });
    pipeline.pack(RoomClosingStruct, {
      reason,
      finalTick: this.serverTick,
    });

    this.broadcast(RELAY_BYTES_CHANNEL, pipeline.toUint8Array());
  }

  /**
   * Get connected player count (excluding pending late joiners)
   */
  public override get connectedPlayerCount(): number {
    let count = 0;
    for (const player of this._players.values()) {
      if (player.isConnected && !this._pendingLateJoiners.has(
        Array.from(this._players.entries()).find(([, p]) => p === player)?.[0] ?? ''
      )) {
        count++;
      }
    }
    return count;
  }
}
