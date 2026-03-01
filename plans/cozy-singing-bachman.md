# Plan: Input Validation — CLAUDE.md guidelines + roblox-like fix

## Context

The framework's binary layer validates RPC **structure** (buffer length, slot matching, tick range) but NOT field **values**. `sanitizeInputData()` truncates float32 precision via `Math.fround()` but allows NaN/Infinity through. A crafted network packet can inject NaN/Infinity into float32 RPC fields, which propagates through MathOps trig functions and into Rapier physics, corrupting simulation state for all clients.

`MathOps.clamp(NaN, min, max)` returns NaN (because `Math.max(min, NaN) = NaN`), so clamp alone is insufficient — must check `Number.isFinite()` first.

Current state in roblox-like: zero input validation in `ApplyCharacterInputSystem` — raw RPC values go directly into CharacterState and then to physics.

## Changes

### 1. Add "Input Validation" section to CLAUDE.md

Insert after the "Code Conventions" section. Content:

```markdown
## Input Validation (RPC Sanitization)

**All RPC data from players must be treated as potentially malicious.** The binary layer validates message structure but does NOT validate field values — NaN, Infinity, and out-of-range numbers pass through network deserialization. A crafted packet can corrupt simulation state for all clients.

**Rules for every system that reads RPC data:**
- **Check `Number.isFinite()` on every float field** before use. Replace non-finite values with a safe default (usually 0). `MathOps.clamp(NaN, min, max)` returns NaN — always check finiteness BEFORE clamping.
- **Clamp all float fields to their semantic range.** Direction vectors: clamp each component to [-1, 1], then re-normalize if magnitude > 1. Angles: any finite value is valid for trig functions, but clamp to [-PI, PI] if stored for comparison. Speed/power: clamp to [0, 1] or the game's expected range.
- **Treat uint8 boolean fields as non-zero = true.** Uint8 values are auto-masked to 0-255 by `truncateToFieldType`, so they cannot overflow, but treat them as booleans (!=0), never use the raw numeric value in arithmetic.
- **Validate early, in the "Apply Input" system** — the first system that reads RPCs. Never let unsanitized values reach movement, physics, or state systems.

**Sanitization pattern:**
```typescript
// Helper: returns 0 for NaN/Infinity, value otherwise
const finite = (v: number): number => Number.isFinite(v) ? v : 0;

// In apply-input system:
let dirX = finite(rpc.data.directionX);
let dirZ = finite(rpc.data.directionZ);
dirX = MathOps.clamp(dirX, -1, 1);
dirZ = MathOps.clamp(dirZ, -1, 1);
const cameraYaw = finite(rpc.data.cameraYaw);
```

**Why not validate in the framework?** The framework is game-agnostic — it doesn't know semantic ranges for game-specific RPCs. Validation belongs in game simulation code where the meaning of each field is known.
```

### 2. Fix `apply-character-input.system.ts` in roblox-like

**File:** `roblox-like/roblox-like-simulation/src/lib/systems/apply-character-input.system.ts`

Add a `finite()` helper and sanitize all RPC fields before use:

- `directionX`, `directionZ`: `finite()` then `MathOps.clamp(v, -1, 1)`
- `cameraYaw`: `finite()` (any finite angle is valid for sin/cos)
- `jump`, `sprint`: uint8, already safe (non-zero = true), no change needed

The clamped direction components pass through the existing rotation matrix transform, producing a world-space vector with magnitude <= 1. The `CharacterMovementSystem` then normalizes it and applies speed — this pipeline is already correct for clamped input.

## Files to modify

1. **`CLAUDE.md`** — add "Input Validation" section after "Code Conventions"
2. **`roblox-like/roblox-like-simulation/src/lib/systems/apply-character-input.system.ts`** — sanitize RPC fields

## Verification

- Run roblox-like game locally, verify character moves correctly with keyboard
- Review that NaN/Infinity values would be caught by the `finite()` check
- No tests to run (roblox-like simulation has no unit tests currently)
