# CTrace Diagnostics Visualization

## Overview

The CTrace GUI now includes a comprehensive diagnostics visualization system that parses JSON output from CTrace and provides an interactive interface for analyzing code issues.

## Features

### 1. **Metadata Display**
When you run CTrace, the analysis metadata is displayed at the top of the output panel showing:
- Tool name and version
- Analysis mode (IR, AST, etc.)
- Input file path
- Stack limit configuration
- Analysis execution time
- Number of functions analyzed

### 2. **Diagnostics List**
All diagnostics are displayed in an organized, interactive list showing:
- **Diagnostic ID**: Unique identifier for each diagnostic
- **Severity Level**: ERROR, WARNING, or INFO with color coding
  - 🔴 ERROR: Red (#ff6b6b)
  - 🟠 WARNING: Orange (#ffa500)
  - 🔵 INFO: Blue (#58a6ff)
- **Rule ID**: The specific rule that triggered the diagnostic
- **Location**: Function name and line number
- **Message**: Detailed description of the issue

### 3. **Severity Filtering**
Use the dropdown filter to show only specific severity types:
- **ALL**: Show all diagnostics (default)
- **ERROR**: Show only errors
- **WARNING**: Show only warnings
- **INFO**: Show only informational messages

The counter updates to show filtered/total diagnostics (e.g., "Diagnostics (5/10)")

### 4. **Code Highlighting in Editor**
Diagnostic locations are visually highlighted in the Monaco editor:
- **Underlines**: Wavy underlines appear under problematic code
  - Red wavy for errors
  - Orange wavy for warnings
  - Blue wavy for info
- **Background**: Semi-transparent colored backgrounds
- **Glyph Margin**: Icons appear in the left margin (❌ ⚠️ ℹ️)
- **Minimap**: Diagnostic locations are marked in the minimap
- **Overview Ruler**: Vertical scrollbar shows diagnostic positions

### 5. **Interactive Hover Details**
Hover over any highlighted code to see:
- Severity level and rule ID
- Diagnostic ID
- Function name
- Exact location (line:column)
- Full diagnostic message
- Variable aliasing information (if available)

### 6. **Click to Navigate**
Click on any diagnostic in the list to automatically:
- Jump to the corresponding line in the editor
- Center the line in the viewport
- Focus the editor for immediate interaction

## Usage

### Running CTrace Analysis

1. Open a C/C++ source file in the editor
2. Click **"Ctrace Tools"** in the menu or use the tools panel
3. Click **"Run CTrace"** button
4. Wait for the analysis to complete

### Viewing Diagnostics

The CTrace output panel will automatically:
- Parse the JSON response
- Display metadata at the top
- Show all diagnostics below with filtering options
- Apply visual highlights in the editor

### Filtering Diagnostics

1. Use the **"Filter"** dropdown in the diagnostics header
2. Select the desired severity level
3. The list and editor decorations update automatically

### Navigating to Issues

**Method 1**: Click on any diagnostic item in the list
**Method 2**: Hover over highlighted code in the editor to see details
**Method 3**: Look for glyph icons in the editor's left margin

### Clearing Diagnostics

Click the **"Clear"** button in the CTrace output panel to:
- Clear all displayed diagnostics
- Remove editor highlights
- Reset the output panel

## Implementation Details

### Files Added/Modified

#### New Files:
- `src/renderer/managers/DiagnosticsManager.js` - Core diagnostics handling
- `src/styles/diagnostics.css` - Styling for diagnostics UI

#### Modified Files:
- `src/renderer/UIController.js` - Integration of diagnostics manager
- `src/index.html` - Added diagnostics stylesheet link

### API Reference

#### DiagnosticsManager Class

**Constructor**
```javascript
new DiagnosticsManager(monacoEditorManager)
```

**Methods**
- `parseOutput(output)` - Parse JSON output from CTrace
- `renderMetadata()` - Generate HTML for metadata section
- `renderDiagnostics()` - Generate HTML for diagnostics list
- `displayDiagnostics()` - Render and apply all diagnostics
- `changeSeverityFilter(severity)` - Update severity filter
- `jumpToDiagnostic(diagId)` - Navigate to diagnostic location
- `applyMonacoDecorations()` - Add visual highlights in editor
- `registerHoverProvider()` - Enable hover tooltips
- `clear()` - Remove all diagnostics data and decorations

### JSON Format Expected

```json
{
  "meta": {
    "tool": "ctrace-stack-analyzer",
    "inputFile": "/path/to/file.c",
    "mode": "IR",
    "stackLimit": 8388608,
    "analysisTimeMs": 150
  },
  "functions": [...],
  "diagnostics": [
    {
      "id": "diag-1",
      "severity": "WARNING",
      "ruleId": "StackPointerEscape",
      "location": {
        "function": "parse_elf64",
        "startLine": 196,
        "startColumn": 9,
        "endLine": 0,
        "endColumn": 0
      },
      "details": {
        "message": "stack pointer escape: address of variable...",
        "variableAliasing": []
      }
    }
  ]
}
```

## Keyboard Shortcuts

- **Ctrl+F**: Find in editor (works with highlighted code)
- **Ctrl+G**: Go to line (useful with diagnostic line numbers)

## Color Scheme

The diagnostics UI follows the GitHub Dark theme:
- Background: `#0d1117`, `#161b22`
- Borders: `#30363d`, `#21262d`
- Text: `#f0f6fc`, `#7d8590`
- Accent: `#58a6ff`
- Error: `#ff6b6b`
- Warning: `#ffa500`
- Info: `#58a6ff`

## Troubleshooting

### Diagnostics Not Showing
- Ensure CTrace is outputting valid JSON format
- Check browser console for parsing errors
- Verify the `--sarif-format` flag is being used

### Editor Highlights Not Appearing
- Ensure Monaco editor is fully initialized
- Check that the file is open in the editor
- Verify diagnostic locations have valid line numbers

### Hover Not Working
- Monaco hover provider requires C/C++ language mode
- Ensure the file type is correctly detected
- Check that diagnostics exist at the hovered line

## Future Enhancements

Potential improvements for future versions:
- Export diagnostics to CSV/HTML report
- Diagnostic history across multiple runs
- Custom severity rules and filtering
- Integration with external linters
- Diagnostic quickfix suggestions
