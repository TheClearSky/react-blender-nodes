/** Typed folder names: letters, digits and single spaces. */
const NOT_ALLOWED = /[^A-Za-z0-9 ]/g;
/** Typing or pasting one of these ends a folder name. */
const SEPARATORS = /[/›>]/;

/** Keeps letters, digits and single spaces; reports whether anything went. */
function cleanTypedName(text: string): { clean: string; dropped: boolean } {
  const kept = text.replace(NOT_ALLOWED, '');
  return {
    clean: kept.replace(/ {2,}/g, ' '),
    dropped: kept.length !== text.length,
  };
}

/**
 * Splits typed or pasted text on the separators: every piece before the last
 * is a finished folder name (blank ones dropped), the last is still being
 * typed. `Group Nodes/Drums/Ki` → complete ['Group Nodes', 'Drums'], rest 'Ki'.
 */
function parsePathText(text: string): {
  complete: string[];
  rest: string;
  dropped: boolean;
} {
  const pieces = text.split(SEPARATORS).map(cleanTypedName);
  const complete = pieces
    .slice(0, -1)
    .map((piece) => piece.clean.trim())
    .filter((name) => name !== '');
  return {
    complete,
    rest: pieces[pieces.length - 1].clean.trimStart(),
    dropped: pieces.some((piece) => piece.dropped),
  };
}

export { cleanTypedName, parsePathText, SEPARATORS };
