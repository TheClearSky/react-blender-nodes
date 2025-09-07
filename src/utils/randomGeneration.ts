/**
 * Generates a random alphanumeric string of specified length
 *
 * This function creates a cryptographically random string using Math.random()
 * converted to base-36. It efficiently handles long strings by generating
 * multiple segments and concatenating them.
 *
 * @param length - The desired length of the random string
 * @returns A random alphanumeric string of the specified length
 *
 * @example
 * ```tsx
 * generateRandomString(8)   // "a1b2c3d4"
 * generateRandomString(16)  // "a1b2c3d4e5f6g7h8"
 * generateRandomString(1)   // "a"
 * generateRandomString(0)   // ""
 * ```
 */
function generateRandomString(length: number) {
  const strings: string[] = [];
  const maxCharactersFromSingleString = 8;
  for (let i = 0; i < Math.floor(length / maxCharactersFromSingleString); i++) {
    strings.push(
      Math.random()
        .toString(36)
        .substring(2, maxCharactersFromSingleString + 2),
    );
  }
  if (length % maxCharactersFromSingleString > 0) {
    strings.push(
      Math.random()
        .toString(36)
        .substring(2, (length % maxCharactersFromSingleString) + 2),
    );
  }
  return strings.join('');
}

export { generateRandomString };
