export type Listener<T> = (event: T) => void;

export class EventEmitter<TEvent> {
  private readonly _listeners = new Set<Listener<TEvent>>();

  public subscribe(listener: Listener<TEvent>): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  public emit(event: TEvent): void {
    for (const listener of this._listeners) {
      listener(event);
    }
  }

  public clear(): void {
    this._listeners.clear();
  }

  public get hasListeners(): boolean {
    return this._listeners.size > 0;
  }
}
