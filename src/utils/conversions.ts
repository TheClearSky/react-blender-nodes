/**
 * Converts a string to a number, handling the case where the string contains a decimal point
 * - Can handle numbers with decimals and negative numbers
 * - Incase of multiple decimal points, the first one is used and the rest are ignored
 * - Incase of multiple negative signs, the first one is used and the rest are ignored
 * @param inputNumberAsString - The string to convert to a number
 * @returns The number
 */
function convertStringToNumber(inputNumberAsString: string) {
  //Take care of the negative sign
  const isNegative = inputNumberAsString.startsWith('-');

  //Remove all non-numeric and non-decimal characters, we will just use the first decimal point
  const textWithJustNumbersAndDecimals = inputNumberAsString.replaceAll(
    /[^0-9\.]/g,
    '',
  );

  //Get the first decimal point and append and prepend the numbers before and after the decimal point
  const firstDecimalIndex = textWithJustNumbersAndDecimals.indexOf('.');
  let finalProcessedNumber = 0;

  //If there is no decimal point, we can just convert the string to a number
  if (firstDecimalIndex === -1) {
    finalProcessedNumber = Number(textWithJustNumbersAndDecimals);
  } else {
    //If there is a decimal point, we need to split the string into the numbers before and after the decimal point and join them with a decimal point
    const numberBeforeDecimal = textWithJustNumbersAndDecimals
      .substring(0, firstDecimalIndex)
      .replaceAll(/[^0-9]/g, '');
    const numberAfterDecimal = textWithJustNumbersAndDecimals
      .substring(firstDecimalIndex + 1)
      .replaceAll(/[^0-9]/g, '');
    finalProcessedNumber = Number(
      numberBeforeDecimal + '.' + numberAfterDecimal,
    );
  }

  //If the number is negative, we need to make it negative
  if (isNegative) {
    finalProcessedNumber = -finalProcessedNumber;
  }

  //Return the final processed number
  return finalProcessedNumber;
}

/**
 * Sanitizes a number to be shown as a text, removing the trailing zeros after the decimal point if the number is an integer
 * @param value - The number to sanitize
 * @param numberOfDecimals - The number of decimals to show for the number
 * @returns The sanitized number as a string
 */
function sanitizeNumberToShowAsText(value: number, numberOfDecimals: number) {
  return value.toFixed(numberOfDecimals).replace(/[0]+$/, '');
}

export { convertStringToNumber, sanitizeNumberToShowAsText };
