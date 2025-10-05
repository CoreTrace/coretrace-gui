# CTrace GUI - Developer Guide

## 📋 Documentation Overview

This project uses **JSDoc** for comprehensive API documentation. The documentation is automatically generated from comments in the source code and provides detailed information about all classes, methods, and functions.

## 🚀 Generating Documentation

### Install Dependencies
```bash
npm install
```

### Generate Documentation
```bash
npm run docs
```

### Watch Mode (Auto-regenerate)
```bash
npm run docs:watch
```

## 📁 Documentation Structure

The generated documentation is organized as follows:

- **`docs/overview.html`** - Project overview and navigation
- **`docs/index.html`** - Main JSDoc documentation index
- **`docs/UIController.html`** - Main UI controller documentation
- **`docs/FileOperationsManager.html`** - File operations documentation
- **`docs/TabManager.html`** - Tab management documentation
- **`docs/SearchManager.html`** - Search functionality documentation
- **`docs/EditorManager.html`** - Editor management documentation
- **`docs/NotificationManager.html`** - Notification system documentation

## 🏗️ Architecture Documentation

### Main Process (`src/main/`)
- **`main.js`** - Application entry point
- **`ipc/fileHandlers.js`** - File system IPC handlers
- **`ipc/ctraceHandlers.js`** - CTrace execution handlers
- **`ipc/editorHandlers.js`** - Editor-related handlers
- **`utils/fileUtils.js`** - File system utilities

### Renderer Process (`src/renderer/`)
- **`UIController.js`** - Main UI coordinator
- **`managers/`** - Specialized manager classes
- **`utils/`** - Renderer utilities

## 📝 JSDoc Standards

### Class Documentation
```javascript
/**
 * Brief description of the class.
 * 
 * Detailed description explaining the purpose and functionality.
 * 
 * @class ClassName
 * @author CTrace GUI Team
 * @version 1.0.0
 * 
 * @example
 * const instance = new ClassName(param1, param2);
 */
class ClassName {
  // ...
}
```

### Method Documentation
```javascript
/**
 * Brief description of the method.
 * 
 * Detailed description of what the method does.
 * 
 * @async
 * @memberof ClassName
 * @param {string} param1 - Description of parameter 1
 * @param {Object} param2 - Description of parameter 2
 * @returns {Promise<Object>} Description of return value
 * 
 * @example
 * const result = await instance.methodName('value', {option: true});
 */
async methodName(param1, param2) {
  // ...
}
```

### Property Documentation
```javascript
/**
 * Description of the property
 * @type {string}
 * @private
 */
this.propertyName = 'value';
```

## 🔧 Configuration

### JSDoc Configuration (`jsdoc.conf.json`)
```json
{
  "source": {
    "include": ["./src/", "./README.md"],
    "includePattern": "\\.(js)$",
    "exclude": ["./node_modules/", "./dist/", "./build/"]
  },
  "opts": {
    "destination": "./docs/",
    "recurse": true,
    "readme": "./README.md"
  },
  "plugins": ["plugins/markdown"],
  "metadata": {
    "title": "CTrace GUI Documentation",
    "description": "Complete documentation for the CTrace GUI Electron application"
  }
}
```

## 📊 Coverage Guidelines

Aim for documentation coverage of:
- ✅ **All public classes** - Complete with examples
- ✅ **All public methods** - Parameters, return values, examples
- ✅ **Key private methods** - Internal functionality
- ✅ **Complex algorithms** - Detailed explanations
- ✅ **Configuration objects** - Property descriptions

## 🎯 Best Practices

1. **Use descriptive summaries** - First line should clearly explain the purpose
2. **Include examples** - Show how to use classes and methods
3. **Document parameters thoroughly** - Include types and descriptions
4. **Explain return values** - What does the method return?
5. **Use @memberof** - Clearly associate methods with classes
6. **Mark async methods** - Use @async for Promise-returning methods
7. **Private vs Public** - Use @private for internal methods

## 🔗 Useful Links

- [JSDoc Official Documentation](https://jsdoc.app/)
- [JSDoc Tags Reference](https://jsdoc.app/index.html#block-tags)
- [Electron Documentation](https://www.electronjs.org/docs)

## 📈 Viewing Documentation

1. Generate docs: `npm run docs`
2. Open `docs/overview.html` for project overview
3. Open `docs/index.html` for complete API documentation
4. Navigate using the sidebar or search functionality

The documentation is fully self-contained HTML and can be:
- Viewed locally in any web browser
- Hosted on a web server
- Included in project releases
- Shared with team members

## 🤝 Contributing

When adding new code:
1. Add comprehensive JSDoc comments
2. Include usage examples where appropriate
3. Regenerate documentation: `npm run docs`
4. Verify documentation renders correctly
5. Update this guide if needed

Happy documenting! 📚