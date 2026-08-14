import { DiagnosticCollection } from './diagnostic.js';

export function createLanguagesApi() {
  return {
    createDiagnosticCollection(name) {
      return new DiagnosticCollection(name);
    },
    registerCompletionItemProvider() {
      return { dispose() {} };
    },
    registerHoverProvider() {
      return { dispose() {} };
    },
    match() {
      // No real selector/document matching yet -- callers that gate
      // behavior on this see "no match" rather than crashing.
      return 0;
    },
  };
}
