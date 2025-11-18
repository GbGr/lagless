# Lagless ECS Project Constitution

This constitution governs the Nx-based TypeScript monorepo located at `lagless`, which implements an Entity Component System (ECS) framework with deterministic simulation, rollback, and networking. All contributors must follow the articles below; deviations require an approved RFC documented in this repository.

## 1. Language and Clarity

- All source code, comments, READMEs, and supporting documents must be written in clear technical English with unambiguous terminology.
- Documentation must prefer explicit statements of intent, invariants, constraints, and examples instead of implied behavior.

## 2. Deterministic Simulation Guarantees

- Given the same ordered player input sequence, the ECS world must always converge to the same state across all platforms, build targets, and execution modes.
- Systems may not rely on wall-clock time, `Math.random`, floating-point nondeterminism, or any external mutable state unless that dependency is explicitly seeded and replicated in tests.
- Determinism safeguards (fixed update step, deterministic math utilities, canonical serialization) must be part of the shared `@lagless/core` or other dedicated Nx libraries to prevent divergence between projects.

## 3. Rollback and Time-Travel Safety

- Systems and components must treat world state as snapshot-able data. Side effects outside the ECS world (I/O, DOM, audio) must be funneled through adapters that can be rewound or reconstructed from deterministic events.
- Rollback relies on pure or referentially transparent system functions. Local caches, singletons, or global mutable state are prohibited unless they can be fully reconstructed from the ECS history.
- Each system README must describe its rollback strategy, including what data is stored per tick and how conflicts are resolved during re-simulation.

## 4. Networking Isolation

- Network transports may only send player input, commands, or other high-level events. Raw ECS state, component arrays, or simulation snapshots may not cross the network boundary.
- Networking layers must treat the server-side ECS world as authoritative. Client predictions must be designed for correction through rollback without mutating authoritative state directly.
- Network schemas must be defined in dedicated Nx libraries (e.g., `@lagless/net-wire`, `@lagless/schemas`) with versioning and compatibility notes documented.

## 5. Clear Nx Module Boundaries

- Each Nx project owns exactly one clear responsibility (simulation, rendering, input relay, etc.) and exposes a well-defined public API surface documented in its README.
- Cross-project dependencies must respect the dependency graph enforced by Nx; circumventing via relative imports or path hacks is disallowed.
- Shared utilities belong in dedicated libraries (such as `@lagless/core`, `@lagless/math`, `@lagless/misc`) and must not introduce knowledge of application-specific systems.

## 6. Documentation as a First-Class Artifact

- Every Nx project must include a README describing:
  - Responsibilities and how the project fits into the ECS simulation and rollback pipeline.
  - Public API (modules, functions, CLI targets) with expected inputs/outputs.
  - Invariants, preconditions, postconditions, and non-obvious constraints.
  - Integration points with other projects and assumptions about deterministic behavior.
- README files must be kept in sync with the code; any change to a public API, invariant, or simulation responsibility requires a documentation update in the same change set.

## 7. AI-Friendly Documentation

- READMEs must feature dedicated sections for Preconditions, Postconditions, Safety Notes, and Testing Guidance so AI coding agents can modify code without violating invariants.
- Non-obvious constraints (e.g., fixed tick duration, serialization order) must be enumerated explicitly, including failure modes if they are violated.
- When new invariants are introduced, add machine-readable checklists or tables that agents can reference before modifying code.

## 8. Testing Discipline

- Any change touching simulation, deterministic math, rollback, or networking prediction must include deterministic unit or integration tests. Tests must replay ordered input sequences and assert canonical outcomes.
- Property-based or fuzz tests must be added when feasible to cover edge cases around rollback windows, floating point ranges, and network jitter.
- Tests must run through `nx test <project>` (or other relevant targets) and be idempotent; they may not depend on network availability or non-deterministic timers.
- CI must block merges when simulation or rollback tests are missing or flaky. Contributors must provide evidence (test logs or new suites) when altering critical systems.

## 9. Governance and Enforcement

- Pull requests must cite the relevant constitution articles being satisfied or amended.
- Violations discovered during code review or CI require immediate remediation before merge.
- The constitution may only be updated through consensus of the core maintainers, recorded in version control with rationale.

By contributing to this monorepo you agree to uphold this constitution and keep the ECS simulation deterministic, rollback-safe, and networking-isolated while maintaining rigorous documentation and testing standards.
