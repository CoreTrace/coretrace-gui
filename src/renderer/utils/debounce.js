;(function() {
/**
 * Creates a debounced wrapper around a function.
 *
 * Returns an object with three methods:
 *   .call(...args)  — schedule fn to run after `delay` ms (resets the timer on each call)
 *   .cancel()       — cancel any pending invocation without calling fn
 *   .flush(...args) — cancel any pending invocation and call fn immediately
 *
 * Uses only Node.js / browser built-ins (setTimeout / clearTimeout).
 * Safe to call .cancel() or .flush() even when no timer is pending.
 *
 * @param {Function} fn    - The function to debounce.
 * @param {number}   delay - Debounce delay in milliseconds.
 * @returns {{ call: Function, cancel: Function, flush: Function }}
 */
function debounce(fn, delay) {
  let timer = null;

  return {
    call(...args) {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        fn(...args);
      }, delay);
    },

    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },

    flush(...args) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      fn(...args);
    }
  };
}

if (typeof window !== 'undefined') window.debounce = debounce;
if (typeof module !== 'undefined' && module.exports) module.exports = debounce;
})();
