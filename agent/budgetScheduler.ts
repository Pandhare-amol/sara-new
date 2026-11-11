export interface TaskBudget { priority?: number; timeoutMs?: number; maxConcurrent?: number; }
interface Item<T> { priority: number; enqueuedAt: number; budget: TaskBudget; work: () => Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void; }

/** Bounded priority queue for background work. It never invents progress and enforces time limits. */
export class BudgetScheduler {
  private readonly queue: Item<unknown>[] = [];
  private running = 0;
  constructor(private readonly defaultConcurrency = 2) {}
  enqueue<T>(work: () => Promise<T>, budget: TaskBudget = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ priority: budget.priority ?? 5, enqueuedAt: Date.now(), budget, work, resolve: resolve as (v: unknown) => void, reject });
      this.queue.sort((a, b) => b.priority - a.priority || a.enqueuedAt - b.enqueuedAt); this.pump();
    });
  }
  status(): { queued: number; running: number; concurrency: number } { return { queued: this.queue.length, running: this.running, concurrency: this.defaultConcurrency }; }
  private pump(): void {
    while (this.running < this.defaultConcurrency && this.queue.length) {
      const item = this.queue.shift()!; this.running++;
      const work = Promise.resolve().then(item.work);
      let timer: NodeJS.Timeout | undefined;
      const timeout = item.budget.timeoutMs
        ? new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Task budget timeout exceeded.")), item.budget.timeoutMs);
          timer.unref?.();
        })
        : null;
      const result = timeout ? Promise.race([work, timeout]) : work;
      result.then(item.resolve, item.reject).finally(async () => {
        if (timer) clearTimeout(timer);
        // A timeout limits the caller's wait; it cannot cancel arbitrary work
        // because the callback has no AbortSignal. Keep the slot occupied until
        // the underlying operation really settles.
        await work.catch(() => undefined);
        this.running--;
        this.pump();
      });
    }
  }
}
