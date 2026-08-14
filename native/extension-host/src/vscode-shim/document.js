import { Range } from './range.js';
import { Uri } from './uri.js';

// Fake in-memory TextDocument. Only implements the slice of the real
// vscode.TextDocument API that the Phase 0 spike extension touches.
export class TextDocument {
  constructor(text, fileName = 'untitled', languageId = 'plaintext') {
    this._lines = text.split('\n');
    this.fileName = fileName;
    this.uri = Uri.file(fileName);
    this.languageId = languageId;
    this.isClosed = false;
  }

  get lineCount() {
    return this._lines.length;
  }

  get text() {
    return this._lines.join('\n');
  }

  lineAt(lineNumber) {
    const text = this._lines[lineNumber] ?? '';
    return { text, range: new Range(lineNumber, 0, lineNumber, text.length) };
  }

  getText(range) {
    if (!range) return this.text;
    if (range.isSingleLine) {
      return this._lines[range.start.line].slice(range.start.character, range.end.character);
    }
    const parts = [];
    for (let line = range.start.line; line <= range.end.line; line += 1) {
      const lineText = this._lines[line] ?? '';
      const from = line === range.start.line ? range.start.character : 0;
      const to = line === range.end.line ? range.end.character : lineText.length;
      parts.push(lineText.slice(from, to));
    }
    return parts.join('\n');
  }

  getWordRangeAtPosition(position) {
    const line = this._lines[position.line] ?? '';
    const wordPattern = /\w+/g;
    let match = wordPattern.exec(line);
    while (match) {
      const start = match.index;
      const end = start + match[0].length;
      if (position.character >= start && position.character <= end) {
        return new Range(position.line, start, position.line, end);
      }
      match = wordPattern.exec(line);
    }
    return undefined;
  }

  replaceRange(range, replacement) {
    if (range.isSingleLine) {
      const line = this._lines[range.start.line];
      this._lines[range.start.line] =
        line.slice(0, range.start.character) + replacement + line.slice(range.end.character);
      return;
    }
    const before = this._lines[range.start.line].slice(0, range.start.character);
    const after = this._lines[range.end.line].slice(range.end.character);
    const replacementLines = replacement.split('\n');
    replacementLines[0] = before + replacementLines[0];
    replacementLines[replacementLines.length - 1] += after;
    this._lines.splice(range.start.line, range.end.line - range.start.line + 1, ...replacementLines);
  }
}
