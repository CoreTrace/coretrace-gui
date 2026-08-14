import { Position } from './position.js';
import { Range } from './range.js';
import { Selection } from './selection.js';
import { EventEmitter } from './eventEmitter.js';
import { Disposable } from './disposable.js';
import { Diagnostic, DiagnosticSeverity } from './diagnostic.js';
import { Uri } from './uri.js';
import { ViewColumn } from './viewColumn.js';
import { RelativePattern } from './relativePattern.js';
import { createWindowApi } from './window.js';
import { createWorkspaceApi } from './workspace.js';
import { createCommandsApi } from './commands.js';
import { createLanguagesApi } from './languages.js';

// The object returned in place of `require('vscode')` inside a loaded
// extension. Deliberately only the slice of the real API this spike's
// target extensions need -- see native/docs/phase0-status.md for scope.
export function createVscodeShim(registry) {
  return {
    Position,
    Range,
    Selection,
    EventEmitter,
    Disposable,
    Diagnostic,
    DiagnosticSeverity,
    Uri,
    ViewColumn,
    RelativePattern,
    window: createWindowApi(),
    workspace: createWorkspaceApi(),
    commands: createCommandsApi(registry),
    languages: createLanguagesApi(),
  };
}
