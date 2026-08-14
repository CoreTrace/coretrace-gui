export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
};

export class Diagnostic {
  constructor(range, message, severity) {
    this.range = range;
    this.message = message;
    this.severity = severity ?? DiagnosticSeverity.Error;
  }
}

export class DiagnosticCollection {
  constructor(name) {
    this.name = name;
    this._entries = new Map();
  }

  set(uri, diagnostics) {
    this._entries.set(String(uri), diagnostics);
  }

  get(uri) {
    return this._entries.get(String(uri)) ?? [];
  }

  dispose() {
    this._entries.clear();
  }
}
