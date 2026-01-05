# AGENTS: @lagless/net-wire

## Purpose and boundaries
- Define the binary wire protocol and timing helpers for input-only networking.
- Not responsible for transport (Colyseus) or ECS simulation itself.

## Imports and entry points
- `libs/net-wire/src/index.ts`
- `libs/net-wire/src/lib/protocol.ts`
- `libs/net-wire/src/lib/clock-sync.ts`
- `libs/net-wire/src/lib/input-delay-controller.ts`
- `libs/net-wire/src/lib/relay-room-options.ts`
- `libs/net-wire/src/lib/tick-input-buffer.ts`

## Common tasks -> files
- Add or change a message type: `libs/net-wire/src/lib/protocol.ts`.
- Adjust clock sync math: `libs/net-wire/src/lib/clock-sync.ts`.
- Tune input delay behavior: `libs/net-wire/src/lib/input-delay-controller.ts`.
- Update room option types: `libs/net-wire/src/lib/relay-room-options.ts`.

## Integration points
- Server side: `@lagless/colyseus-rooms` uses these schemas in relay rooms.
- Client side: `@lagless/relay-input-provider` encodes/decodes messages.
- Circle Sumo backend and frontend consume those layers.

## Invariants and rules
- All packets start with `HeaderStruct` and a valid `MsgType`.
- Field order and sizes are stable; breaking changes require `WireVersion` bump.
- Payloads must remain input-only per project constitution.

## Workflow for modifications
- Update protocol code, then update relay and input provider handlers.
- Update README examples and any docs in dependent modules.
- Verify with `nx lint @lagless/net-wire`, `nx typecheck @lagless/net-wire`, and `nx test @lagless/net-wire`.

## Example future AI tasks
1) Add a new packet type for diagnostics: update `protocol.ts`, update both server and client handlers, update docs.
2) Adjust delay calculation: edit `input-delay-controller.ts`, add tests, document the new tuning.
3) Add a schema for late-join sync: update `protocol.ts`, update relay rooms, update input provider.
