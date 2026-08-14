export class Disposable {
  constructor(dispose) {
    this._dispose = dispose ?? (() => {});
  }

  dispose() {
    this._dispose();
  }

  static from(...disposables) {
    return new Disposable(() => {
      disposables.forEach((d) => d && d.dispose && d.dispose());
    });
  }
}
