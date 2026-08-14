# Fourth spike extension: webview-central case

The second extension (`bierner.docs-view`) had a webview as a secondary
feature. This one closes that gap: [`janisdd.vscode-edit-csv`](https://open-vsx.org/extension/janisdd/vscode-edit-csv)
0.11.9 -- a real, dependency-free (beyond `@vscode/webview-ui-toolkit` and
`dayjs`), 250K+ downloads extension whose **entire purpose** is a
Handsontable-based CSV table editor rendered in a webview panel. There is
no non-webview fallback feature here to fall back on.

Not vendored (same reasoning as the other spike extensions). Fetch
before running `try-load.mjs`:

```sh
cd native/extension-host/spike-extension-webview-central
curl -sL -o ext.vsix \
  https://open-vsx.org/api/janisdd/vscode-edit-csv/0.11.9/file/janisdd.vscode-edit-csv-0.11.9.vsix
unzip -o -q ext.vsix -d unpacked
node try-load.mjs
```

## Finding

**The entire core feature path runs to completion**, not just
`activate()`. `try-load.mjs` sets a fake active `.csv` editor, invokes
the real `edit-csv.edit` command, and the extension's own code:
reads its full ~50-key configuration schema (via the same
`configDefaults.js` mechanism proven in the diagnostics spike), calls
the real (stubbed) `vscode.window.createWebviewPanel`, reads its own
real HTML/CSS/JS asset files from disk via `context.extensionPath`, and
assigns a genuine **46.7KB** HTML document to `panel.webview.html` --
confirmed by instrumenting the shim, not assumed.

Required shim growth beyond the first three extensions: `vscode.Uri`
(including `.with()` for building modified copies), `vscode.ViewColumn`,
`vscode.RelativePattern`, `workspace.asRelativePath`,
`workspace.createFileSystemWatcher` (stub), `window.createWebviewPanel`
(stub panel + writable `webview.html`/`postMessage`/`onDidReceiveMessage`),
`context.extensionPath`/`extensionUri`, and `TextDocument` gained real
`fileName`/`uri`/`languageId` fields (previously only used by
change-case's Range/Selection-based editing, never needed for a real
path).

**This is the strongest possible version of the plan's flagged webview
risk, and the architecture survives it cleanly**: the extension never
crashes, never throws past what a missing rendering surface should
cause, and everything up to "the browser would now paint this HTML" runs
correctly. The only thing this architecture genuinely cannot do is the
one thing it was never going to be able to do by design -- paint that
HTML somewhere. That is a fully contained, precisely-scoped limitation,
not a reason to reject webview-central extensions outright: if a real
CoreTrace release wanted to support this specific extension, the only
missing piece is *some* rendering surface to hand `panel.webview.html`
to (e.g. a narrow embedded-webview carve-out, exactly the option the
plan's Key Risks section already flagged as worth deciding explicitly).
