const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const isDev = process.argv.includes('--dev');

const outfile = path.join(rootDir, 'src', 'renderer', 'bundle.js');

const inputFiles = [
  'src/renderer/utils/fileTypeUtils.js',
  'src/renderer/utils/syntaxHighlighter.js',
  'src/renderer/managers/NotificationManager.js',
  'src/renderer/managers/MonacoEditorManager.js',
  'src/renderer/managers/TabManager.js',
  'src/renderer/managers/SearchManager.js',
  'src/renderer/managers/FileOperationsManager.js',
  'src/renderer/managers/DiagnosticsManager.js',
  'src/renderer/managers/StateManager.js',
  'src/renderer/managers/TerminalManager.js',
  'src/renderer/managers/PerformanceManager.js',
  'src/renderer/managers/WSLManager.js',
  'src/renderer/managers/UpdaterManager.js',
  'src/renderer/managers/ResizeManager.js',
  'src/renderer/managers/CTraceRunner.js',
  'src/renderer/components/ActivityBar.js',
  'src/renderer/components/FileTree.js',
  'src/renderer/components/EditorPanel.js',
  'src/renderer/components/AssistantPanel.js',
  'src/renderer/UIController.js',
];

// Concatenate sources in dependency order (same as before — each file is a
// self-contained IIFE that assigns its class to window.ClassName).
const header = '/* Auto-generated — do not edit. Run: npm run build:renderer */\n/* eslint-disable */\n';
const concatenated = header + inputFiles
  .map((rel) => {
    const src = fs.readFileSync(path.join(rootDir, rel), 'utf8').trimEnd();
    return `// ----- ${rel} -----\n${src}\n`;
  })
  .join('\n');

// Use esbuild *transform* (not bundle) — no module resolution, no require()
// wrapping. Just minification and source maps applied to the flat script.
const result = esbuild.transformSync(concatenated, {
  loader: 'js',
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
  // Keep the global class names intact during minification (they are referenced
  // as window.ClassName across the script, so they must not be renamed).
  minifyIdentifiers: false,
});

fs.writeFileSync(outfile, result.code, 'utf8');
console.log(`[build:renderer] ${isDev ? 'Dev' : 'Production'} bundle → src/renderer/bundle.js`);
