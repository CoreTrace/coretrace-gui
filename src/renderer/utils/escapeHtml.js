/**
 * Shared HTML escaping helper for the renderer.
 *
 * Every value that comes from outside the renderer (file names, paths, tool
 * output, error messages, model ids, ...) must pass through this before it is
 * interpolated into an innerHTML template. It escapes the five characters that
 * matter in both text and attribute contexts, so the result is safe inside
 * element bodies and inside double- or single-quoted attributes.
 */
(function () {
  const ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  /**
   * @param {*} value - Value to escape; null/undefined become an empty string
   * @returns {string}
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
  }

  window.escapeHtml = escapeHtml;
})();
