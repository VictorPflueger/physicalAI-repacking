// The wake bridge between the night player (js/night.js) and a producer (the live agent or the scripted
// replay; PLAN.md decision 5). The night plays until a wake-up and then stands still: the player hands
// the wake-up over and waits until the producer's turn is over. The producer's tool sim_advance ends
// its turn and waits for the next wake-up; the first wake-up (night start) is the producer's first turn.
// At night end the producer writes its summary, and release() lets the night finish.
//
//   player:   await bridge.wake(w)        resolves when the producer's turn at w is over
//   producer: w = await bridge.first()    the night-start wake-up
//             w = await bridge.advance()  ends the turn; resolves with the next wake-up (null once released)
//             bridge.release()            the run is over: no further turns

export function createWakeBridge() {
  let pending = null;   // a wake-up that has arrived and the producer has not taken yet
  let waiter = null;    // the producer's wait for the next wake-up
  let endTurn = null;   // ends the player's wait: the producer's turn is over
  let closed = false;
  let current = null;   // the wake-up of the turn in progress

  function next() {
    if (pending) { const w = pending; pending = null; current = w; return Promise.resolve(w); }
    if (closed) return Promise.resolve(null);
    return new Promise((resolve) => { waiter = (w) => { current = w; resolve(w); }; });
  }

  return {
    wake(w) {
      if (closed) return Promise.resolve();
      return new Promise((resolve) => {
        endTurn = resolve;
        if (waiter) { const r = waiter; waiter = null; r(w); } else pending = w;
      });
    },
    first: () => next(),
    advance() {
      const r = endTurn;
      endTurn = null;
      current = null;
      r?.();
      return next();
    },
    release() {
      closed = true;
      const r = endTurn;
      endTurn = null;
      r?.();
      const w = waiter;
      waiter = null;
      w?.(null);
    },
    current: () => current,
    isClosed: () => closed
  };
}
