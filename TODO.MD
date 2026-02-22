1. [DONE] CRITICAL: Payload VIEW вместо COPY в unpack-функциях протокола
    Файлы: libs/net-wire/src/lib/protocol.ts:468, :494; libs/relay-server/src/lib/input-handler.ts:86, :168

    unpackTickInputFanout создаёт VIEW во входной буфер:
    // protocol.ts:468
    const payload = new Uint8Array(data, offset, payloadLength); // VIEW

    А unpackTickInput создаёт COPY:
    // protocol.ts:385
    const payload = new Uint8Array(pipeline.sliceRemaining()).slice(0, input.payloadLength); // COPY

    То же на сервере — validateClientInput (:86) и validateClientInputBatch (:168) создают views.

    Почему это проблема:
    - GC не может освободить весь входящий ArrayBuffer пока жива маленькая view-ссылка на payload → утечка памяти при высокой частоте сообщений
      - Bun (который используется для game-server) может переиспользовать буферы WebSocket в определённых конфигурациях → коррупция данных
      - Клиентский unpackInputPayload (relay-input-provider.ts:330-332) вынужден делать защитную копию — это работает, но хрупко и маскирует корневую проблему

    Фикс: Заменить new Uint8Array(data, offset, payloadLength) на new Uint8Array(data.slice(offset, offset + payloadLength)) во всех четырёх местах.



---
2. SERIOUS: Гонка при state transfer — новый игрок получает fanout до StateResponse

Файл: libs/relay-server/src/lib/relay-room.ts:262-290

conn.connect(ws);                                          // line 262 — игрок в broadcast-пуле
const helloMessage = this.buildServerHello(conn.slot);
conn.send(helloMessage);

const needsStateTransfer = this._clock.tick > 0 && this._config.lateJoinEnabled;
if (needsStateTransfer) {
const stateResult = await this._stateTransfer.requestState(...); // line 273 — AWAIT!

Между conn.connect() и завершением state transfer, broadcastInputBatch итерирует ВСЕ соединения включая нового игрока. Клиент получает:

1. ServerHello
2. Нежелательные fanout-ы от других игроков (во время await)
3. StateResponse (стирает всё)
4. Post-state events

Fanout-ы из пункта 2 заставляют клиента добавлять RPC, возможно откатываться к tick 0, и впустую пересимулировать — всё это потом стирается при обработке StateResponse.

Фикс: Не добавлять соединение в broadcast-пул до завершения state transfer. Вариант: conn.connect(ws) перенести после блока state transfer, либо ввести флаг isReady и проверять его в broadcastInputBatch.

6. MODERATE: handlePlayerConnect — server events от hooks не попадают в post-state batch

Файл: libs/relay-server/src/lib/relay-room.ts:272-297

// Сначала отправляем state + post-state events (lines 274-286)
this.sendStateToPlayer(conn, stateResult);
const postStateEvents = this._serverEventJournal.filter(e => e.tick > stateResult.tick);
this._inputHandler.sendInputBatchToPlayer(postStateEvents, conn);

// ПОТОМ вызываем hook (line 296)
await this._hooks.onPlayerJoin?.(this._context, conn.info);

Hook onPlayerJoin часто вызывает emitServerEvent(PlayerJoined, ...). Это событие:
- Попадает в journal
- Бродкастится всем (включая нового игрока) через broadcastInput

Новый игрок получает его как обычный fanout. Это работает корректно — но только потому что WebSocket гарантирует порядок. Если порядок вызовов изменится (например, hook перенесут до state transfer),
возникнет дублирование событий.

Рекомендация: Документировать этот инвариант или перенести hook call в чётко определённое место в потоке.

7. MODERATE: TickInputBuffer — sentinel 0 коллизия

Файл: libs/net-wire/src/lib/tick-input-buffer.ts:7,32

private _oldestStoredTick = 0; // 0 = "пусто" И "tick 0 хранится"

public add(tick: number, data: Uint8Array): void {
...
if (this._oldestStoredTick === 0 || tick < this._oldestStoredTick) {
this._oldestStoredTick = tick; // При tick=1 перезаписывает 0→1, даже если tick 0 есть
}
}

Фикс: Инициализировать _oldestStoredTick = Infinity (или -1) вместо 0.
