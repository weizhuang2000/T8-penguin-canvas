'use strict';

let activeKey = '';
const waiters = [];

function removeWaiter(waiter) {
  const index = waiters.indexOf(waiter);
  if (index >= 0) waiters.splice(index, 1);
}

function drain() {
  if (activeKey) return;
  while (waiters.length) {
    const waiter = waiters.shift();
    if (waiter.signal?.aborted) continue;
    activeKey = waiter.key;
    waiter.cleanup();
    let released = false;
    waiter.resolve(() => {
      if (released) return;
      released = true;
      if (activeKey === waiter.key) activeKey = '';
      drain();
    });
    return;
  }
}

function acquire(key, signal) {
  const normalizedKey = String(key || `render-${Date.now()}`);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('渲染等待已取消'), { name: 'AbortError' }));
    const waiter = {
      key: normalizedKey,
      signal,
      resolve,
      reject,
      cleanup: () => signal?.removeEventListener?.('abort', onAbort),
    };
    const onAbort = () => {
      removeWaiter(waiter);
      reject(Object.assign(new Error('渲染等待已取消'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    waiters.push(waiter);
    drain();
  });
}

function status() {
  return {activeKey: activeKey || undefined, queued: waiters.length};
}

module.exports = {acquire, status};
