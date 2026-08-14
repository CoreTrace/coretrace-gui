import { Position } from './position.js';

// Matches vscode.Range's two constructor forms: (Position, Position) and
// (startLine, startChar, endLine, endChar).
export class Range {
  constructor(a, b, c, d) {
    if (typeof a === 'number') {
      this.start = new Position(a, b);
      this.end = new Position(c, d);
    } else {
      this.start = a;
      this.end = b;
    }
  }

  get isSingleLine() {
    return this.start.line === this.end.line;
  }
}
