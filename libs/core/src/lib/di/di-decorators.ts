import type { Token } from './di-container.js';

const DESIGN_PARAM_TYPES = 'design:paramtypes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Reflect: any;

export function ECSSystem(...overrideDeps: Token[]): ClassDecorator {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return (target: Function) => {
    // 1) Prefer explicit override tokens if provided
    let deps: Token[] | undefined = overrideDeps.length ? overrideDeps : undefined;

    // 2) Otherwise try to read from reflect metadata
    if (!deps) {
      const getMeta = Reflect['getMetadata'];
      if (typeof getMeta !== 'function') {
        // No reflect-metadata loaded
        if (target.length > 0) {
          throw new Error(
            `[ECSSystem] Unable to infer deps for ${target.name}: Reflect.getMetadata is not available. ` +
            `Import 'reflect-metadata' BEFORE any decorated classes (e.g., via test/setup file).`
          );
        }
        deps = [];
      } else {
        deps = getMeta(DESIGN_PARAM_TYPES, target) as Token[] | undefined;
        if ((!deps || deps.length === 0) && target.length > 0) {
          // Metadata not emitted (transpiler/config issue)
          throw new Error(
            `[ECSSystem] No metadata for ${target.name}. ` +
            `Ensure your TS transpile enables decorator metadata (SWC: transform.decoratorMetadata=true, legacyDecorator=true) ` +
            `and that 'reflect-metadata' is imported early.`
          );
        }
      }
    }

    // 3) Sanity checks and helpful diagnostics
    deps = deps ?? [];
    if (deps.length > 0) {
      // Function.length is the number of declared constructor parameters (excludes rest/default nuance)
      const ctorParams = target.length;
      if (ctorParams > 0 && deps.length !== ctorParams) {
        // Not fatal in runtime, but it usually indicates miscompiled metadata
        // Throw to fail fast with a clear message.
        throw new Error(
          `[ECSSystem] Mismatch for ${target.name}: constructor has ${ctorParams} param(s), ` +
          `but inferred deps array has ${deps.length}. Check your build/transpile settings.`
        );
      }
    }

    // Warn about interfaces/primitives where metadata becomes Object
    if (deps.some((d) => d === Object)) {
      console.warn(
        `[ECSSystem] ${target.name} has constructor params typed as interfaces/primitives. ` +
        `Runtime tokens will be 'Object'. Use class types or pass tokens explicitly: @ECSSystem(A, B).`
      );
    }

    // Validate tokens are constructable (best-effort)
    for (const d of deps) {
      if (typeof d !== 'function') {
        throw new Error(
          `[ECSSystem] ${target.name} received a non-constructable token in deps. ` +
          `Each token must be a class (newable).`
        );
      }
    }

    // 4) Expose deps for your Container (must be on the static 'deps' field to stay compatible)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    (target as unknown as { deps: Array<Function> }).deps = deps;
  };
}
