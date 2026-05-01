/**
 * Renderer bundle entry point.
 *
 * Files are loaded in dependency order: utilities → managers → components → UIController.
 * Each file wraps its class in an IIFE and assigns it to window.ClassName so that later
 * modules can reference it by name (standard browser global-scope pattern).
 *
 * This file is the input for esbuild. Do not load it directly in index.html —
 * only the generated bundle.js should be loaded there.
 */

// Utilities (no dependencies on other app modules)
require('./utils/fileTypeUtils');
require('./utils/syntaxHighlighter');

// Managers (depend on utilities only)
require('./managers/NotificationManager');
require('./managers/MonacoEditorManager');
require('./managers/TabManager');
require('./managers/SearchManager');
require('./managers/FileOperationsManager');
require('./managers/DiagnosticsManager');
require('./managers/StateManager');
require('./managers/TerminalManager');
require('./managers/PerformanceManager');
require('./managers/WSLManager');
require('./managers/UpdaterManager');
require('./managers/ResizeManager');
require('./managers/CTraceRunner');

// Components (depend on managers)
require('./components/ActivityBar');
require('./components/FileTree');
require('./components/EditorPanel');
require('./components/AssistantPanel');

// Top-level controller — must be last
require('./UIController');
