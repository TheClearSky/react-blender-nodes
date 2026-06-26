/**
 * A tiny indented string builder for emitting readable source. Tracks an
 * indentation depth and offers block / if-else helpers so the emitters read like
 * the code they produce. No project knowledge — pure text assembly.
 */
class CodeWriter {
  private readonly lines: string[] = [];
  private depth = 0;

  /** Append one line at the current indentation (blank lines stay blank). */
  line(text: string = ''): void {
    this.lines.push(text.length === 0 ? '' : '  '.repeat(this.depth) + text);
  }

  /** Write an opening line (e.g. `{`) and indent the lines that follow. */
  openBlock(open: string): void {
    this.line(open);
    this.depth++;
  }

  /** Dedent, then write a closing line (default `}`). */
  closeBlock(close: string = '}'): void {
    this.depth = Math.max(0, this.depth - 1);
    this.line(close);
  }

  /** Convenience: `open { … body … } close`. */
  block(open: string, body: () => void, close: string = '}'): void {
    this.openBlock(open);
    body();
    this.closeBlock(close);
  }

  /** Emit `if (condition) { thenBody } else { elseBody }` with a joined `} else {`. */
  ifElse(condition: string, thenBody: () => void, elseBody: () => void): void {
    this.openBlock(`if (${condition}) {`);
    thenBody();
    this.depth = Math.max(0, this.depth - 1);
    this.line('} else {');
    this.depth++;
    elseBody();
    this.closeBlock('}');
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

export { CodeWriter };
