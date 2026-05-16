/**
 * Type-safe wrapper around Object.keys() for Record<K, V> where K extends string.
 *
 * Object.keys() returns string[] by design in TypeScript because of structural
 * subtyping. This utility is safe when the object is a closed configuration map
 * where no extra keys exist at runtime (e.g. state.typeOfNodes, state.dataTypes).
 */
function typedKeys<K extends string>(object: Partial<Record<K, unknown>>): K[] {
  return Object.keys(object) as K[];
}

export { typedKeys };
