import { AbstractInputProvider, ECSConfig, IAbstractInputConstructor, InputData, InputRegistry, RPC } from '@lagless/core';
import { Client, SeatReservation } from 'colyseus.js';
import { ClientRole, PlayerFinishedGameStruct } from '@lagless/net-wire';
import { InferBinarySchemaValues } from '@lagless/binary';
import { Matchmaking } from './matchmaking.js';
import { RelayInputProviderV2 } from './relay-input-provider-v2.js';

export interface MultiplayerClientConfig {
  relayUrl: string;
  authToken: string;
  ecsConfig: ECSConfig;
  inputRegistry: InputRegistry;
  version: string;
  allowLateJoin?: boolean;
}

export type MatchRequest =
  | { mode: 'quick'; filters?: Record<string, string | number> }
  | { mode: 'create'; maxPlayers: number; roomCodeLength?: number; filters?: Record<string, string | number> }
  | { mode: 'join'; code: string };

export interface MultiplayerSession {
  inputProvider: AbstractInputProvider;
  roomId: string;
  playerSlot: number;
  roomCode?: string;
}

export interface MultiplayerClient {
  connect(request: MatchRequest): Promise<MultiplayerSession>;
  submitLocalInput<TInputCtor extends IAbstractInputConstructor>(
    ctor: TInputCtor,
    data: InputData<InstanceType<TInputCtor>>
  ): void;
  onRemoteInputs(handler: (rpcs: RPC[]) => void): () => void;
  getConnectionState(): 'idle' | 'connecting' | 'connected' | 'rejoining' | 'closed';
  leave(reason?: string): Promise<void>;
  endGame(payload: Omit<InferBinarySchemaValues<typeof PlayerFinishedGameStruct>, 'verifiedTick'>): void;
}

class MultiplayerClientImpl implements MultiplayerClient {
  private readonly _config: MultiplayerClientConfig;
  private _state: 'idle' | 'connecting' | 'connected' | 'rejoining' | 'closed' = 'idle';
  private _client: Client | null = null;
  private _inputProvider: RelayInputProviderV2 | null = null;
  private readonly _pendingInputs: Array<{ ctor: IAbstractInputConstructor; data: InputData<any> }> = [];
  private _unsubscribeDrain: (() => void) | null = null;
  private _roomCode: string | undefined;

  constructor(config: MultiplayerClientConfig) {
    this._config = config;
  }

  public async connect(request: MatchRequest): Promise<MultiplayerSession> {
    if (this._state !== 'idle' && this._state !== 'closed') {
      throw new Error('MultiplayerClient already connected or connecting');
    }

    this._state = 'connecting';
    const matchmaking = new Matchmaking();
    let result: { client: Client; seatReservation: SeatReservation; roomCode?: string };

    switch (request.mode) {
      case 'quick':
        result = await matchmaking.quickMatch(
          this._config.relayUrl,
          this._config.ecsConfig,
          this._config.authToken,
          request.filters
        );
        break;
      case 'create':
        result = await matchmaking.createRoom(
          this._config.relayUrl,
          this._config.ecsConfig,
          this._config.authToken,
          request.maxPlayers,
          request.roomCodeLength,
          request.filters
        );
        break;
      case 'join':
        result = await matchmaking.joinByCode(
          this._config.relayUrl,
          this._config.ecsConfig,
          this._config.authToken,
          request.code
        );
        break;
    }

    this._client = result.client;
    this._roomCode = result.roomCode;

    const inputProvider = await RelayInputProviderV2.connect(
      this._config.ecsConfig,
      this._config.inputRegistry,
      result.client,
      result.seatReservation,
      {
        clientVersionHash: hashString(this._config.version),
        schemaHash: hashInputRegistry(this._config.inputRegistry),
        role: ClientRole.Player,
      }
    );

    this._inputProvider = inputProvider;
    this._unsubscribeDrain = inputProvider.drainInputs((addRpc) => {
      if (this._pendingInputs.length === 0) return;
      const pending = this._pendingInputs.splice(0);
      for (const item of pending) {
        addRpc(item.ctor, item.data);
      }
    });

    this._state = 'connected';

    return {
      inputProvider,
      roomId: result.seatReservation.roomId,
      playerSlot: inputProvider.playerSlot,
      roomCode: this._roomCode,
    };
  }

  public submitLocalInput<TInputCtor extends IAbstractInputConstructor>(
    ctor: TInputCtor,
    data: InputData<InstanceType<TInputCtor>>
  ): void {
    this._pendingInputs.push({ ctor, data });
  }

  public onRemoteInputs(handler: (rpcs: RPC[]) => void): () => void {
    if (!this._inputProvider) {
      return () => {
        // do nothing
      };
    }

    return this._inputProvider.onRemoteInputs(handler);
  }

  public getConnectionState(): 'idle' | 'connecting' | 'connected' | 'rejoining' | 'closed' {
    return this._state;
  }

  public async leave(): Promise<void> {
    this._state = 'closed';
    this._unsubscribeDrain?.();
    this._unsubscribeDrain = null;
    this._inputProvider?.dispose();
    this._inputProvider = null;
    this._client = null;
  }

  public endGame(
    payload: Omit<InferBinarySchemaValues<typeof PlayerFinishedGameStruct>, 'verifiedTick'>
  ): void {
    this._inputProvider?.sendPlayerFinishedGame(payload);
  }
}

export function createMultiplayerClient(config: MultiplayerClientConfig): MultiplayerClient {
  return new MultiplayerClientImpl(config);
}

function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i);
    hash >>>= 0;
  }
  return hash >>> 0;
}

function hashInputRegistry(registry: InputRegistry): number {
  const anyRegistry = registry as unknown as { _idToInputMap?: Map<number, { id: number; fields: unknown[] }> };
  const map = anyRegistry._idToInputMap;
  if (!map) return 0;

  const entries = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  let hash = 0;
  for (const [id, input] of entries) {
    hash = ((hash * 31) + id) >>> 0;
    hash = ((hash * 31) + (input.fields?.length ?? 0)) >>> 0;
  }
  return hash >>> 0;
}
