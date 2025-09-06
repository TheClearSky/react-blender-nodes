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
