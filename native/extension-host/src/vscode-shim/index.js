import { Position } from './position.js';
import { Range } from './range.js';
import { Selection } from './selection.js';
import { createWindowApi } from './window.js';
import { createWorkspaceApi } from './workspace.js';
import { createCommandsApi } from './commands.js';

// The object returned in place of `require('vscode')` inside a loaded
// extension. Deliberately only the slice of the real API this spike's
// target extension needs -- see native/docs/phase0-status.md for scope.
export function createVscodeShim(registry) {
  return {
    Position,
    Range,
    Selection,
    window: createWindowApi(),
    workspace: createWorkspaceApi(),
    commands: createCommandsApi(registry),
  };
}
