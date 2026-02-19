import type { QueueEntry, QueueStore } from './types.js';

/**
 * In-memory queue store for single-instance deployments and testing.
 * For multi-instance deployments, implement QueueStore with Redis.
 */
export class InMemoryQueueStore implements QueueStore {
  private readonly _queues = new Map<string, QueueEntry[]>();

  public add(scope: string, entry: QueueEntry): void {
    let queue = this._queues.get(scope);
    if (!queue) {
      queue = [];
      this._queues.set(scope, queue);
    }
    queue.push(entry);
  }

  public remove(scope: string, playerId: string): boolean {
    const queue = this._queues.get(scope);
    if (!queue) return false;

    const index = queue.findIndex(e => e.playerId === playerId);
    if (index === -1) return false;

    queue.splice(index, 1);

    if (queue.length === 0) {
      this._queues.delete(scope);
    }

    return true;
  }

  public getAll(scope: string): ReadonlyArray<QueueEntry> {
    return this._queues.get(scope) ?? [];
  }

  public getCount(scope: string): number {
    return this._queues.get(scope)?.length ?? 0;
  }

  public getActiveScopes(): ReadonlyArray<string> {
    return Array.from(this._queues.keys());
  }

  public has(scope: string, playerId: string): boolean {
    const queue = this._queues.get(scope);
    if (!queue) return false;
    return queue.some(e => e.playerId === playerId);
  }

  public clear(): void {
    this._queues.clear();
  }
}
