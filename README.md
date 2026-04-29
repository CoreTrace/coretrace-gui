# CTrace GUI

A modern Electron-based GUI application for running CTrace analysis on C/C++ code.

## Overview

CTrace GUI provides an intuitive interface for analyzing C/C++ source code using the CTrace static analysis tool. The application features a VS Code-like interface with file management, syntax highlighting, and integrated analysis results.

## Features

- **File Management**: Open individual files or entire workspaces
- **File Tree Explorer**: Navigate project structure with refresh and auto-watch capabilities
- **Code Editor**: Syntax-highlighted editor with line numbers and search functionality
- **Tab Management**: Multi-file editing with tab interface
- **CTrace Integration**: Run static analysis directly from the GUI
- **Search**: Global search across workspace files
- **AI Assistant**: Chat with local or cloud LLM models about your code
- **Notifications**: User-friendly notification system
- **Work Loss Prevention**: Automatic session saving and restoration

## Architecture

The application follows a modular architecture with separate managers for different concerns:

- **UIController**: Main coordinator for all UI components
- **FileOperationsManager**: Handles file I/O operations via IPC
- **TabManager**: Manages editor tabs and file switching
- **EditorManager**: Controls the Monaco code editor
- **SearchManager**: Handles search operations (widget and sidebar)
- **NotificationManager**: Manages user notifications
- **StateManager**: Handles session persistence (work loss prevention)
- **DiagnosticsManager**: Manages CTrace analysis results and visualization

The renderer process communicates with the main process exclusively through a typed IPC bridge defined in `src/preload.js`. All IPC channels are whitelisted — the renderer cannot call anything not on the list.

---

## Getting Started

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | v18 or later | Required for the build toolchain |
| npm | bundled with Node.js | Used to install dependencies |
| CTrace binary | any | Must be placed at `bin/ctrace` (see below) |

> **Windows users:** CTrace is a Linux binary. It runs inside WSL (Windows Subsystem for Linux). The application will detect WSL on startup and guide you through installation if it is missing.

### Installation

```bash
npm install
```

This installs all Node.js dependencies including Electron and Monaco Editor.

### CTrace Binary Setup

The CTrace binary must be present before you can run analyses. Place it at:

```
bin/ctrace          # Linux / macOS
bin/ctrace          # Windows (the binary itself runs inside WSL)
```

The `bin/` directory is at the root of the repository (same level as `package.json`). Create it if it doesn't exist.

If the binary is missing, the application will still launch, but the **Run Analysis** button will return an error.

### Running in Development

```bash
npm start
```

This automatically rebuilds the renderer bundle (`src/renderer/bundle.js`) before launching Electron. You must rerun `npm start` (or `npm run build:renderer`) any time you edit files under `src/renderer/`.

### Building for Distribution

| Platform | Command | Output |
|---|---|---|
| Current platform | `npm run dist` | `dist/` |
| Linux (AppImage) | `npm run dist:linux` | `dist/*.AppImage` |
| Windows (NSIS installer) | `npm run dist:win` | `dist/*.exe` |
| macOS (DMG) | `npm run dist:mac` | `dist/*.dmg` |

### Running Tests

```bash
npm test
```

Uses Node.js's built-in test runner (`node --test`). No extra test framework is required.

### Generating Documentation

```bash
npm run docs
```

Generates JSDoc API docs. Hosted version: https://coretrace.github.io/coretrace-gui/

---

## Documentation

Complete API documentation is available [here](https://coretrace.github.io/coretrace-gui/)

IPC channel reference (all renderer ↔ main channels): [docs/ipc-channels.md](docs/ipc-channels.md)


---

## License

// To determine
