export type Token<T = any> = new (...args: any[]) => T;

export class Container {
  private readonly _singletons = new Map<Token, any>();

  public resolve<T>(cls: Token<T>): T {
    if (this._singletons.has(cls)) return this._singletons.get(cls);
    const deps: Token[] = (cls as any).deps;
    if (!deps) throw new Error(`Non injectable class ${cls.name}`);
    const args = deps.map((t) => {
      try {
        return this.resolve(t);
      } catch {
        throw new Error(`Failed to resolve ${cls.name} dependency ${t.name}`);
      }
    });
    const obj = new cls(...args);
    this._singletons.set(cls, obj);
    return obj;
  }

  public register<T>(cls: Token<T>, instance: T): void {
    this._singletons.set(cls, instance);
  }
}
