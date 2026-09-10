'use strict';

/**
 * @fileoverview Shared error formatting utilities for the main process.
 *
 * Provides contextual, human-readable error messages for file-system operations
 * with platform-aware suggestions (Windows vs macOS/Linux).
 */

const path = require('path');

/**
 * Error code → description + platform-aware suggestion.
 * `suggestion` may be a string or a zero-argument function that returns a string.
 */
const FILE_ERROR_HINTS = {
  ENOENT: {
    description: 'file or directory not found',
    suggestion: 'Check that the path exists and has not been moved or deleted.',
  },
  EACCES: {
    description: 'permission denied',
    suggestion: () =>
      process.platform === 'win32'
        ? 'Try running the application as Administrator.'
        : 'Check file permissions (chmod) or try with elevated privileges.',
  },
  EPERM: {
    description: 'operation not permitted',
    suggestion: () =>
      process.platform === 'win32'
        ? 'Try running the application as Administrator.'
        : 'Check that you have the necessary permissions for this path.',
  },
  EBUSY: {
    description: 'file is busy or locked',
    suggestion: 'Close any other program that has this file open, then try again.',
  },
  EMFILE: {
    description: 'too many open files',
    suggestion: 'Close some files or restart the application.',
  },
  ENOSPC: {
    description: 'no space left on device',
    suggestion: 'Free up disk space and try again.',
  },
  EEXIST: {
    description: 'file or directory already exists',
    suggestion: 'Choose a different name or remove the existing entry first.',
  },
  EISDIR: {
    description: 'path is a directory, not a file',
    suggestion: 'Provide a file path, not a directory path.',
  },
  ENOTDIR: {
    description: 'path is not a directory',
    suggestion: 'Provide a directory path.',
  },
  EROFS: {
    description: 'file system is read-only',
    suggestion: 'Save the file to a different location.',
  },
  ENOTEMPTY: {
    description: 'directory is not empty',
    suggestion: 'Remove the contents of the directory first, or use a recursive delete.',
  },
};

/**
 * Format a file-system error into a contextual, user-facing message.
 *
 * Examples:
 *   formatFileError(err, '/tmp/foo.txt', 'save')
 *   → 'Failed to save "/tmp/foo.txt". File is busy or locked.
 *      Close any other program that has this file open, then try again. (EBUSY)'
 *
 * @param {Error}  err       - The original Node.js error.
 * @param {string} filePath  - The file or directory path involved.
 * @param {string} operation - Short verb describing the operation (e.g. 'save', 'read', 'delete').
 * @returns {string} User-facing error message.
 */
function formatFileError(err, filePath, operation) {
  const normalizedPath = filePath ? path.normalize(filePath) : null;
  const code = err && err.code ? err.code : '';
  const hint = FILE_ERROR_HINTS[code];

  let msg = `Failed to ${operation}`;
  if (normalizedPath) {
    msg += ` "${normalizedPath}"`;
  }
  msg += '.';

  if (hint) {
    const desc = hint.description;
    const suggestion =
      typeof hint.suggestion === 'function' ? hint.suggestion() : hint.suggestion;
    msg += ` ${capitalize(desc)}.`;
    if (suggestion) {
      msg += ` ${suggestion}`;
    }
    if (code) {
      msg += ` (${code})`;
    }
  } else if (err) {
    msg += ` ${err.message}`;
  }

  return msg;
}

/**
 * Returns both a concise user-facing message and a verbose log string.
 * Use the `userMessage` for UI notifications and `logMessage` for console output.
 *
 * @param {Error}  err
 * @param {string} filePath
 * @param {string} operation
 * @returns {{ userMessage: string, logMessage: string }}
 */
function formatFileErrorVerbose(err, filePath, operation) {
  const userMessage = formatFileError(err, filePath, operation);
  const normalizedPath = filePath ? path.normalize(filePath) : '<unknown>';
  const code = err && err.code ? err.code : 'ERR';
  const logMessage = `[${operation}] "${normalizedPath}": [${code}] ${err ? err.message : 'unknown error'}`;
  return { userMessage, logMessage };
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = { formatFileError, formatFileErrorVerbose, FILE_ERROR_HINTS };
