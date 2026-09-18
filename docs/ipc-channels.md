# IPC Channel Reference

Electron apps have two separate JavaScript environments:

- **Main process** (`src/main.js` and `src/main/`) — runs Node.js, has full OS access (file system, child processes, dialogs).
- **Renderer process** (`src/renderer/`) — runs in a sandboxed browser window, has no direct Node.js access.

These two environments talk to each other through **IPC (Inter-Process Communication)**. The bridge is defined in `src/preload.js` and exposed on `window.api` in the renderer.

## How to Call IPC from the Renderer

There are three communication patterns, all accessed through `window.api`:

### `window.api.invoke(channel, ...args)` — Request / Response

Use this when you need a result back. Returns a `Promise`.

```js
// Example: read a file
const result = await window.api.invoke('read-file', '/path/to/file.c');
if (result.success) {
  console.log(result.content);
} else {
  console.error(result.error);
}
```

All invoke handlers return an object with at minimum `{ success: boolean }`. On failure they include `{ success: false, error: string }`.

### `window.api.send(channel, ...args)` — Fire and Forget

Use this when you want to trigger an action in the main process but don't need a response.

```js
// Example: minimize the window
window.api.send('window-minimize');
```

### `window.api.on(channel, callback)` — Listen for Main → Renderer Events

Use this when the main process needs to push data to the renderer unprompted (e.g. a file was changed on disk).

```js
// Example: react to file system changes
const sub = window.api.on('workspace-changed', (data) => {
  console.log('Files changed:', data.changedPath);
});

// Later, when you no longer need it:
window.api.removeListener('workspace-changed', sub);
```

---

## File Operations

These channels handle all file system interactions: opening files, saving, creating, deleting, and watching for changes.

---

**`get-file-tree`** `invoke(channel, folderPath)`

Reads a directory and returns its immediate children (lazy mode — subdirectory contents are not loaded). Use this to refresh the file tree sidebar after a change.

- **`folderPath`** `string` — Absolute path to the directory.
- **Returns** `{ success, fileTree }` — `fileTree` is an array of `{ name, path, type: 'file'|'directory', hasChildren, children }` objects. Directories have `children: null` (lazy) unless already loaded.

Also fires `workspace-loading` events (`start` then `end`) on the main window while running.

---

**`open-folder-dialog`** `invoke(channel)`

Opens the OS folder picker dialog and loads the selected folder as the workspace. Automatically starts watching the folder for file changes.

- **Returns** `{ success, folderPath, fileTree }` on selection, or `{ success: false, canceled: true }` if the user dismissed the dialog.

---

**`open-file-dialog`** `invoke(channel)`

Opens the OS file picker dialog and reads the selected file.

- **Returns** on success: `{ success, filePath, fileName, content, isPartial, totalSize, loadedSize }`. If the file exceeds 1 MB, only the first 1 MB is returned and `isPartial` is `true`. If the file is not UTF-8, returns `{ success: true, warning: 'encoding', filePath, fileName, message }` without content.

---

**`read-file`** `invoke(channel, filePath)`

Reads a file at a known path without opening a dialog. Applies the same 1 MB and encoding checks as `open-file-dialog`.

- **`filePath`** `string` — Absolute path to the file.
- **Returns** `{ success, content, fileName, isPartial, totalSize, loadedSize }` or `{ success: true, warning: 'encoding', ... }` for non-UTF-8 files.

---

**`force-open-file`** `invoke(channel, filePath)`

Opens a file and forces reading it as UTF-8 even if it appears to be binary or non-UTF-8. Characters that can't be decoded appear as replacement characters (`?`). Also respects the 1 MB partial-load limit.

- **`filePath`** `string` — Absolute path to the file.
- **Returns** `{ success, content, fileName, isPartial, totalSize, loadedSize, encodingWarning }`.

---

**`force-load-full-file`** `invoke(channel, filePath)`

Reads an entire file as UTF-8, bypassing the 1 MB size limit. Use this when the user explicitly wants to load a large file in full.

- **`filePath`** `string` — Absolute path to the file.
- **Returns** `{ success, content, fileName, totalSize }`.

---

**`get-directory-contents`** `invoke(channel, dirPath)`

Lazily loads the immediate children of a single directory. Use this when the user expands a folder in the file tree that hasn't been loaded yet.

- **`dirPath`** `string` — Absolute path to the directory.
- **Returns** `{ success, contents }` — `contents` is the same array format as `fileTree` from `get-file-tree`.

---

**`save-file`** `invoke(channel, filePath, content)`

Writes content to an existing file path without showing a dialog. Used for Ctrl+S saves.

- **`filePath`** `string` — Absolute path.
- **`content`** `string` — New file content.
- **Returns** `{ success }`.

---

**`save-file-as`** `invoke(channel, content)`

Opens the OS save dialog and writes content to the chosen path. Used for Ctrl+Shift+S.

- **`content`** `string` — File content to save.
- **Returns** `{ success, filePath, fileName }` or `{ success: false, canceled: true }`.

---

**`create-file`** `invoke(channel, directoryPath, fileName)`

Creates a new empty file inside `directoryPath`. Fails if the file already exists (`EEXIST`).

- **`directoryPath`** `string` — Parent directory.
- **`fileName`** `string` — Name only (no path separators allowed).
- **Returns** `{ success, path, name }`.

---

**`create-folder`** `invoke(channel, directoryPath, folderName)`

Creates a new folder inside `directoryPath`.

- **`directoryPath`** `string` — Parent directory.
- **`folderName`** `string` — Name only (no path separators allowed).
- **Returns** `{ success, path, name }`.

---

**`rename-path`** `invoke(channel, targetPath, newName)`

Renames a file or folder. The new name must not contain path separators.

- **`targetPath`** `string` — Absolute path to the file or folder.
- **`newName`** `string` — New name (basename only).
- **Returns** `{ success, newPath, name, isFile }`.

---

**`delete-path`** `invoke(channel, targetPath)`

Deletes a file or recursively deletes a folder.

- **`targetPath`** `string` — Absolute path.
- **Returns** `{ success }`.

---

**`search-in-files`** `invoke(channel, searchTerm, folderPath)`

Searches all text files under `folderPath` for `searchTerm` (case-insensitive regex). Recurses up to 5 directory levels deep, returns at most 100 matches.

- **`searchTerm`** `string` — Search query (treated as a regex).
- **`folderPath`** `string` — Workspace root to search under.
- **Returns** `{ success, results }` — `results` is an array of `{ file, fileName, line, content, matches }`.

---

**`watch-workspace`** `invoke(channel, folderPath)`

Starts watching `folderPath` for file system changes using chokidar. Any add/remove event (debounced 750 ms) triggers a `workspace-changed` push event to the renderer. Replaces any previously active watcher.

- **`folderPath`** `string` — Directory to watch.
- **Returns** `{ success }`.

---

**`select-llm-file`** `invoke(channel)`

Opens the OS file picker filtered to GGUF/ONNX model files. Used in the AI assistant settings to choose a local model.

- **Returns** `{ success, filePath }` or `{ success: false, canceled: true }`.

---

## CTrace Analysis

---

**`run-ctrace`** `invoke(channel, args)`

Runs the CTrace static analysis engine on a C/C++ file. Starts the ctrace server process if it isn't already running, sends the analysis request to it, and waits for results.

- **`args`** `string[]` — CLI-style arguments, e.g. `['--input=/path/to/file.c', '--static_analysis=true']`. Supported flags:
  - `--input=<path>` (required) — file to analyze
  - `--static_analysis=true|false` (default: `true`)
  - `--dynamic_analysis=true|false` (default: `false`)
  - `--invoke=<tool_name>` — optional tool to invoke (e.g. `ctrace_stack_analyzer`)
  - `--sarif_format=true|false` — request SARIF output
- **Returns** `{ success, output }` where `output` is a JSON string in either SARIF format or the CTrace stack-analyzer format (`{ meta, functions, diagnostics }`).

> **Note:** On Windows, the ctrace binary runs inside WSL. The application checks WSL availability on startup. If WSL is missing, the run will fail with a descriptive error.

---

**`open-editor`** `invoke(channel)`

Opens the system's default plain-text editor (Notepad on Windows, TextEdit on macOS, nano in a terminal on Linux). Used for quick edits outside the app.

- **Returns** nothing meaningful — opens the editor as a fire-and-forget subprocess.

---

## AI Assistant

The assistant supports three providers: **Ollama** (local server), **external** (cloud APIs like OpenAI/Anthropic/Groq), and **local** (a GGUF file loaded directly into the process via `node-llama-cpp`).

---

**`assistant-chat`** `invoke(channel, { provider, message, config })`

Sends a message to the configured AI provider and returns the response.

- **`provider`** `'ollama' | 'external' | 'local'`
- **`message`** `string` — The user's message.
- **`config`** `object` — Provider-specific options:
  - Ollama: `{ ollamaHost, systemPrompt }`
  - External: `{ providerId, apiKey, model, systemPrompt, temperature, maxTokens, ... }`
  - Local: `{ localModelPath, gpuLayers, contextSize, systemPrompt }`
- **Returns** `{ success, reply }` — `reply` is the assistant's response text.

---

**`assistant-get-providers`** `invoke(channel)`

Returns the list of all registered external API providers (OpenAI, Anthropic, Groq, Deepseek, Perplexity, etc.).

- **Returns** `{ success, providers }` — `providers` is an array of provider descriptor objects.

---

**`assistant-test-provider`** `invoke(channel, { providerId, config })`

Tests connectivity to a provider without sending a real message. Useful for validating API keys in the settings UI.

- **`providerId`** `string` — Provider identifier (e.g. `'openai'`).
- **`config`** `object` — Provider config including API key.
- **Returns** `{ success }` or `{ success: false, error }`.

---

**`assistant-unload-local`** `invoke(channel)`

Disposes the currently loaded local GGUF model and frees its memory. Call this when the user changes model settings or closes the assistant panel.

- **Returns** `{ success }`.

---

## Session State

The app automatically saves and restores its state (open tabs, editor positions, diagnostics) to prevent work loss. State is stored as JSON in the Electron `userData` directory.

---

**`save-app-state`** `invoke(channel, state)`

Serializes and saves the current application state. A backup of the previous state file is kept alongside it.

- **`state`** `object` — Arbitrary state object (typically `{ version, timestamp, tabs, diagnostics, ... }`).
- **Returns** `{ success }`.

---

**`load-app-state`** `invoke(channel)`

Loads the last saved state. Falls back to the backup file if the main file is corrupted.

- **Returns** `{ success, state }` or `{ success: false, error: 'No valid state found' }`.

---

**`clear-app-state`** `invoke(channel)`

Deletes both the main and backup state files. Use this to reset the application to a clean start.

- **Returns** `{ success }`.

---

**`get-state-info`** `invoke(channel)`

Returns metadata about the saved state without loading its full contents. Useful for showing "restore session?" prompts without deserializing everything.

- **Returns** `{ success, info }` — `info` is `{ exists, size, modified, version, timestamp, tabCount, hasDiagnostics }` when a state file exists, or `{ exists: false }` when it does not.

---

## Auto-Updater

The app uses `electron-updater` to deliver automatic updates. Two update channels are supported: **main** (stable releases) and **beta** (pre-releases). Update preferences are stored in the `userData` directory.

---

**`updater-get-settings`** `invoke(channel)`

Reads the saved update channel preference and applies it to the updater.

- **Returns** `{ success, settings: { channel }, isPackaged }` — `isPackaged` is `false` in development, which disables actual update checks.

---

**`updater-set-channel`** `invoke(channel, channel)`

Changes the update channel and persists the selection.

- **`channel`** `'main' | 'beta'`
- **Returns** `{ success, settings: { channel } }`.

---

**`updater-check-now`** `invoke(channel)`

Triggers an immediate update check. Only works in packaged builds (`app.isPackaged === true`).

- **Returns** `{ success, updateInfo }` or `{ success: false, error }`.

---

**`updater-install-update`** `invoke(channel)`

Quits the application and installs a previously downloaded update. Only works in packaged builds.

- **Returns** `{ success }` (the app will quit immediately after).

---

**`backend-get-status`** `invoke(channel)`

Returns the most recent backend (ctrace binary) update status recorded by the updater background task.

- **Returns** `{ success, status }` — `status` is a `{ type, ... }` object mirroring the `updater-status` event types, or `null` if no check has run yet.

---

## Window Controls

These `send` channels control the application window. They fire and forget — no response is returned.

---

**`window-minimize`** `send(channel)`  
Minimizes the main window.

**`window-maximize-toggle`** `send(channel)`  
Maximizes the window if it is not maximized, or restores it if it is.

**`window-close`** `send(channel)`  
Closes the main window (triggers the normal close flow including state save).

**`open-visualyzer`** `send(channel)`  
Opens the CTrace Visualizer in a separate window.

---

## Startup & WSL

---

**`startup-ready`** `send(channel, { restored, timestamp, elapsedMs })`

Sent by the renderer once it has finished loading and (optionally) restoring a previous session. Triggers deferred post-startup tasks in the main process (updater initialization, ctrace server warm-up).

- **`restored`** `boolean` — Whether a previous session was restored.
- **`timestamp`** `number` — `Date.now()` at the moment the renderer became ready.
- **`elapsedMs`** `number` — Time in milliseconds from renderer process start to ready.

---

**`check-wsl-status`** `send(channel)`

Asks the main process to detect whether WSL is installed and has a usable Linux distribution. The result is pushed back via the `wsl-status` receive channel. On non-Windows platforms the response is always `{ available: true }`.

---

**`install-wsl`** `send(channel)`

Triggers automatic WSL installation (Windows only, requires administrator privileges). Progress is reported through the `wsl-install-response` receive channel.

---

**`install-wsl-distro`** `send(channel, distroName)`

Installs a specific WSL Linux distribution. Defaults to `'Ubuntu'` if `distroName` is empty.

- **`distroName`** `string` — e.g. `'Ubuntu'`, `'Debian'`.

---

**`show-wsl-setup`** `send(channel)`

Opens the WSL setup dialog from within the main process (Windows only). The dialog guides the user through enabling WSL.

---

## Configuration Updates

**`assistant-config-updated`** `send(channel, config)`

Notifies the main process that the AI assistant configuration has changed (provider, API key, model path, etc.). The main process uses this to update its cached provider settings.

- **`config`** `object` — The updated assistant configuration object.

---

## Main → Renderer Events

These are events the main process pushes to the renderer without being asked. Listen for them with `window.api.on(channel, callback)`.

---

**`workspace-changed`** `on(channel, callback(data))`

Fired when a file or folder is added or removed inside the currently watched workspace. The renderer should refresh the file tree in response.

- **`data`** `{ success: true, folderPath, changedPath }` — `changedPath` is the file/folder that triggered the event.

---

**`workspace-loading`** `on(channel, callback(data))`

Fired at the start and end of a workspace load or refresh operation. Use it to show/hide a loading indicator.

- **`data`** `{ status: 'start'|'end', operation: 'open'|'refresh', folderPath, requestId, success?, error? }` — `success` and `error` are only present on `status: 'end'`.

---

**`wsl-status`** `on(channel, callback(data))`

Response to a `check-wsl-status` send. Reports WSL availability.

- **`data`** `{ available: boolean, hasDistros: boolean, platform: string, distros?: string[] }`

---

**`wsl-install-response`** `on(channel, callback(data))`

Progress and result updates from a `install-wsl` or `install-wsl-distro` send.

- **`data`** — Format varies by installation step; contains at minimum `{ success: boolean }`.

---

**`updater-status`** `on(channel, callback(data))`

Pushed whenever the updater state changes. The `type` field identifies the event:

| `type` | When |
|---|---|
| `checking-for-update` | Update check started |
| `update-available` | A newer version was found (includes `info`) |
| `update-not-available` | Already on the latest version |
| `download-progress` | Download in progress (includes `progress: { percent, transferred, total, bytesPerSecond }`) |
| `update-downloaded` | Download complete, ready to install (includes `info`) |
| `error` | Updater error (includes `message`) |
| `backend-checking-for-update` | Backend binary check started |
| `backend-update-installed` | Backend binary was updated (includes `info`) |
| `backend-update-not-available` | Backend binary already up to date |
| `backend-error` | Backend update check failed (includes `message`) |

---

**`window-maximized`** `on(channel, callback(isMaximized))`

Fired when the window is maximized or restored. Use it to update the maximize/restore button icon in the custom title bar.

- **`isMaximized`** `boolean`

---

**`app-before-quit`** `on(channel, callback())`

Fired just before the application exits. The renderer must synchronously (or via a brief async pause) save the current session state before returning, so no work is lost.
