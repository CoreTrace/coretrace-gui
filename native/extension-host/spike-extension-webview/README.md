# Second spike extension: the webview case

Tests the exact risk the plan flagged: an extension that calls
`vscode.window.registerWebviewViewProvider`. Uses
[`bierner.docs-view`](https://open-vsx.org/extension/bierner/docs-view)
0.1.0 -- a real, unmodified, webpack-bundled extension with a webview
sidebar view plus two ordinary commands (pin/unpin).

Not vendored (same reasoning as `../spike-extension/README.md`). Fetch
before running `try-load.mjs`:

```sh
cd native/extension-host/spike-extension-webview
curl -sL -o ext.vsix \
  https://open-vsx.org/api/bierner/docs-view/0.1.0/file/bierner.docs-view-0.1.0.vsix
unzip -o -q ext.vsix -d unpacked
node try-load.mjs
```

## Finding

**Activates cleanly, and its non-webview commands work.** Getting there
required growing the shim by: `vscode.EventEmitter`, five no-op
`onDid*` event subscriptions (`window.onDidChangeActiveTextEditor`,
`window.onDidChangeTextEditorSelection`,
`window.onDidChangeVisibleTextEditors`,
`workspace.onDidChangeConfiguration`, plus a few workspace document
events added preemptively), `commands.executeCommand`, and a stub
`window.registerWebviewViewProvider` that registers the provider (so
`activate()` succeeds and non-webview features work) but never calls
`resolveWebviewView` (so the view itself never renders -- there is no
rendering surface to hand it in this architecture).

This is graceful degradation, not a crash: a webview-using extension's
*other* features keep working, only the webview surface itself is inert.
That's evidence the plan's flagged "no webview features" limitation can
be a narrow, contained one rather than a reason to reject whole
extensions outright -- worth confirming against a second webview-heavy
extension before treating this as settled.
