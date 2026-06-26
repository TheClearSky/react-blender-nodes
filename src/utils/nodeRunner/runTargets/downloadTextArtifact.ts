/**
 * Trigger a browser download of `text` as a file named `filename`.
 *
 * A tiny, library-free DOM helper that the built-in artifact run targets
 * (`json-ir`, `codegen-js`) use to deliver their output. It is part of the
 * public run-targets surface so a custom artifact target can reuse it instead of
 * re-implementing blob/anchor plumbing — though a target is equally free to
 * deliver its artifact another way (a callback, a network upload, …) inside its
 * own `run`.
 *
 * No-op when there is no DOM (SSR / unit tests, or a browser without
 * `URL.createObjectURL`) so invoking an artifact target's `run` never throws
 * outside the browser.
 */
function downloadTextArtifact(
  filename: string,
  text: string,
  mimeType: string = 'text/plain',
): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { downloadTextArtifact };
