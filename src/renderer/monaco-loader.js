/**
 * Monaco Editor loader.
 *
 * Lives in its own file (rather than an inline <script>) so the page can run
 * under a Content-Security-Policy that forbids inline script.
 */
const monacoBasePath = window.api.getMonacoBasePath();

// monaco.contribution.js has an intermittent AMD module-ordering race on
// file:// protocol: its factory is invoked before a circular dependency is
// fully initialised, causing an uncaught TypeError.
// Fix: reload the page immediately when the error is detected.
// On the reloaded page Monaco's files are already in the OS/Chromium cache
// so they load in a consistent order and the race does not recur.
// sessionStorage prevents an infinite reload loop.
window.addEventListener('error', function (e) {
  if (e.filename && e.filename.includes('monaco.contribution') &&
      !sessionStorage.getItem('_monacoReloaded')) {
    sessionStorage.setItem('_monacoReloaded', '1');
    window.location.reload();
  }
});

function loadMonacoEditor() {
  const loaderScript = document.createElement('script');
  loaderScript.src = monacoBasePath + '/loader.js';
  loaderScript.onload = () => {
    require.config({ paths: { 'vs': monacoBasePath } });

    // Empty blob worker: avoids importScripts('file://') from null origin
    // and avoids the uncaught Worker error event from a file:// URL.
    window.MonacoEnvironment = {
      getWorker: function () {
        return new Worker(URL.createObjectURL(new Blob([''], { type: 'application/javascript' })));
      }
    };

    require(['vs/editor/editor.main'], function () {
      // Successful load — clear the reload guard so future sessions can
      // still auto-reload if the race hits again.
      sessionStorage.removeItem('_monacoReloaded');
      window.monaco = monaco;
      console.log('Monaco Editor loaded successfully');
      window.dispatchEvent(new Event('monaco-loaded'));
    });
  };
  document.head.appendChild(loaderScript);
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(loadMonacoEditor);
  } else {
    setTimeout(loadMonacoEditor, 0);
  }
});
