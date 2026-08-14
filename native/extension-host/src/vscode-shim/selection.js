import { Range } from './range.js';

export class Selection extends Range {
  constructor(a, b, c, d) {
    super(a, b, c, d);
    this.anchor = this.start;
    this.active = this.end;
  }
}
