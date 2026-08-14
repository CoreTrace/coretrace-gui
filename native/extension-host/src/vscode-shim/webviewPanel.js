// No webview rendering surface exists in this architecture (see
// native/docs/phase0-status.md's webview caveat). This stub lets a
// webview-central extension's activation/command-invocation code run to
// completion -- html gets assigned, message handlers get registered --
// without anything ever actually rendering or a postMessage round trip
// ever actually reaching a real UI.
function createWebview() {
  return {
    html: '',
    cspSource: '',
    options: {},
    onDidReceiveMessage() {
      return { dispose() {} };
    },
    postMessage() {
      return Promise.resolve(true);
    },
    asWebviewUri(uri) {
      return uri;
    },
  };
}

export function createWebviewPanel(_viewType, title) {
  return {
    title,
    webview: createWebview(),
    visible: true,
    active: true,
    viewColumn: undefined,
    onDidDispose() {
      return { dispose() {} };
    },
    onDidChangeViewState() {
      return { dispose() {} };
    },
    reveal() {},
    dispose() {},
  };
}
