export class EventEmitter {
  constructor() {
    this._listeners = [];
    this.event = (listener) => {
      this._listeners.push(listener);
      return {
        dispose: () => {
          this._listeners = this._listeners.filter((l) => l !== listener);
        },
      };
    };
  }

  fire(data) {
    this._listeners.forEach((listener) => listener(data));
  }

  dispose() {
    this._listeners = [];
  }
}
