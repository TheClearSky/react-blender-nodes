/**
 * Canonical handle identity key: `name::dataTypeUniqueId`.
 *
 * Handles are matched across two shapes:
 *  - the type definition (`TypeOfInput`), whose `dataType` is a string id, and
 *  - instances (`ConfigurableNodeInput`), whose `dataType` is an object with
 *    `dataTypeUniqueId`.
 *
 * Centralising the formula here guarantees the deletion preview, the deletion
 * cascade, and the existing reorder reconstruction can never drift apart.
 */
function handleKey(name: string, dataTypeUniqueId: string | undefined): string {
  return `${name}::${dataTypeUniqueId ?? ''}`;
}

export { handleKey };
