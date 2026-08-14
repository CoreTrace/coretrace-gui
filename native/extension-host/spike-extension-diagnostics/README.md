# Third spike extension: languages.* / DiagnosticCollection

Closes the last gap from the first two spike extensions (both leaned on
`commands` + editor/window state): tests
`vscode.languages.createDiagnosticCollection` and
`vscode.languages.registerCompletionItemProvider`. Uses
[`mitaki28.vscode-clang`](https://open-vsx.org/extension/mitaki28/vscode-clang)
0.2.4 -- real, unmodified, plain CommonJS, no vendored dependencies
(13.8KB `.vsix`), thematically apt too: it's a clang-backed C/C++
diagnostics + completion extension, same domain as CTrace itself.

Not vendored (same reasoning as the other two spike extensions). Fetch
before running `try-load.mjs`:

```sh
cd native/extension-host/spike-extension-diagnostics
curl -sL -o ext.vsix \
  https://open-vsx.org/api/mitaki28/vscode-clang/0.2.4/file/mitaki28.vscode-clang-0.2.4.vsix
unzip -o -q ext.vsix -d unpacked
node try-load.mjs
```

## Finding

**Activates cleanly, and genuinely reaches `languages.createDiagnosticCollection`
and `languages.registerCompletionItemProvider`** (confirmed by
instrumenting the shim in `try-load.mjs` -- both calls fire during
`activate()`, gated on config values the extension reads from its own
declared defaults, not skipped).

Required shim growth beyond the first two extensions:

- `context.workspaceState` / `globalState` (`vscode-shim/memento.js`) --
  a real `Memento` stand-in, not a stub; `update()`/`get()` actually
  store and retrieve values.
- `workspace.getConfiguration()` upgraded from a dumb default-passthrough
  to reading the loaded extension's own `contributes.configuration.properties`
  (`configDefaults.js` + `extensionLoader.js` registers them at load
  time) -- this is how real VSCode configuration defaults work too, not
  a spike-only shortcut.
- `window.createOutputChannel`, `showWarningMessage`, `showErrorMessage`.
- `commands.registerTextEditorCommand`.
- `languages.createDiagnosticCollection`, `registerCompletionItemProvider`,
  `registerHoverProvider` (stub, unexercised by this extension but same
  shape), `match` (stub, returns "no match").
- `vscode.Disposable` (with static `.from(...)`), `vscode.Diagnostic`,
  `vscode.DiagnosticSeverity`.

Not exercised: actual diagnostic computation or completion (both need a
real `clang` binary invocation plus a document-change event actually
firing, which `workspace.onDidChangeTextDocument` still doesn't do --
it's a no-op stub). This spike only proves registration-time activation,
same bar as the other two.
