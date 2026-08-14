export class Uri {
  constructor(fsPath, scheme = 'file') {
    this.fsPath = fsPath;
    this.scheme = scheme;
    this.path = fsPath;
  }

  toString() {
    return `${this.scheme}://${this.fsPath}`;
  }

  with(changes = {}) {
    const next = new Uri(changes.path ?? this.fsPath, changes.scheme ?? this.scheme);
    next.query = changes.query ?? this.query;
    next.fragment = changes.fragment ?? this.fragment;
    return next;
  }

  static file(fsPath) {
    return new Uri(fsPath);
  }
}
