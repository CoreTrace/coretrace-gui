// Fake in-memory TextEditor. edit() applies replacements synchronously so
// callers observe the mutated document as soon as the returned promise's
// executor runs, matching how the spike drives it from invoke_command.
export class TextEditor {
  constructor(document) {
    this.document = document;
    this.selections = [];
  }

  get selection() {
    return this.selections[0];
  }

  set selection(value) {
    this.selections = [value];
  }

  edit(callback) {
    const edits = [];
    const editBuilder = {
      replace(range, text) {
        edits.push({ range, text });
      },
    };
    callback(editBuilder);

    edits
      .slice()
      .sort((a, b) => {
        if (a.range.start.line !== b.range.start.line) {
          return b.range.start.line - a.range.start.line;
        }
        return b.range.start.character - a.range.start.character;
      })
      .forEach(({ range, text }) => this.document.replaceRange(range, text));

    return Promise.resolve(true);
  }
}
