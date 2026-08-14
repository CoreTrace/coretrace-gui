# Spike extension fixture

The Phase 0 "does a real VSCode extension actually run in our sidecar"
proof uses [`wmaurer.change-case` 1.0.0](https://open-vsx.org/extension/wmaurer/change-case),
fetched from Open VSX. It's small, plain CommonJS, MIT-licensed, and only
touches `commands`, `window.activeTextEditor`, `TextEditor.edit`,
`Range`/`Selection`, and `workspace.getConfiguration` — a bounded surface
for the first shim iteration.

Not vendored into the repo (third-party code, don't want its own
`node_modules` in our tree). Fetch it locally before running
`native/extension-host` or the `real_extension` example:

```sh
cd native/extension-host/spike-extension
curl -sL -o change-case.vsix \
  https://open-vsx.org/api/wmaurer/change-case/1.0.0/file/wmaurer.change-case-1.0.0.vsix
unzip -o -q change-case.vsix -d unpacked
```

This produces `unpacked/extension/` (manifest + `out/src/*.js` + its own
`node_modules`), which `extension-host/src/index.js` loads at startup.
