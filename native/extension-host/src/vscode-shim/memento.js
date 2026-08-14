// Stand-in for vscode.Memento (context.workspaceState / globalState).
export class Memento {
  constructor() {
    this._values = new Map();
  }

  get(key, defaultValue) {
    return this._values.has(key) ? this._values.get(key) : defaultValue;
  }

  update(key, value) {
    this._values.set(key, value);
    return Promise.resolve();
  }
}
