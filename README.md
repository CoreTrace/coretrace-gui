# CTrace GUI

A modern Electron-based GUI application for running CTrace analysis on C/C++ code.

## Overview

CTrace GUI provides an intuitive interface for analyzing C/C++ source code using the CTrace analysis tool. The application features a VS Code-like interface with file management, syntax highlighting, and integrated analysis results.

## Features

- **File Management**: Open individual files or entire workspaces
- **File Tree Explorer**: Navigate project structure with refresh and auto-watch capabilities
- **Code Editor**: Syntax-highlighted editor with line numbers and search functionality
- **Tab Management**: Multi-file editing with tab interface
- **CTrace Integration**: Run static analysis directly from the GUI
- **Search**: Global search across workspace files
- **Notifications**: User-friendly notification system

## Architecture

The application follows a modular architecture with separate managers for different concerns:

- **UIController**: Main coordinator for all UI components
- **FileOperationsManager**: Handles file I/O operations
- **TabManager**: Manages editor tabs and file switching
- **EditorManager**: Controls the code editor functionality
- **SearchManager**: Handles search operations
- **NotificationManager**: Manages user notifications

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm
- Electron
- CTrace binary

### Installation

```bash
npm install
```

### Running the Application

```bash
npm start
```

### Building the Application

```bash
npm run dist
```

### Generating Documentation

```bash
npm run docs
```

## Documentation

Complete API documentation is available in the `docs/` directory after running `npm run docs`.

## License


// To determine
