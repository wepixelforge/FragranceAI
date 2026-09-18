/**
 * Sequential conversational turn queue.
 * Typing stays enabled; submitted messages wait until the in-flight turn finishes
 * so later responses cannot overwrite earlier state.
 */
export type QueuedTurn<T> = T & { id: string };

export function createSequentialTurnQueue<T extends { id: string }>(
  runTurn: (item: T) => Promise<void>
) {
  const queue: T[] = [];
  let running = false;
  let generation = 0;

  async function drain() {
    if (running) return;
    running = true;
    const started = generation;
    try {
      while (queue.length > 0 && started === generation) {
        const item = queue.shift();
        if (!item) break;
        await runTurn(item);
      }
    } finally {
      running = false;
      if (queue.length > 0 && started === generation) {
        void drain();
      }
    }
  }

  return {
    enqueue(item: T) {
      queue.push(item);
      void drain();
    },
    get length() {
      return queue.length;
    },
    get isRunning() {
      return running;
    },
    peekIds() {
      return queue.map((item) => item.id);
    },
    clear() {
      generation += 1;
      queue.length = 0;
      running = false;
    },
  };
}
