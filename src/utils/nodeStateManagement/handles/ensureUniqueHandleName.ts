import type { SupportedUnderlyingTypes } from '../types';
import type { z } from 'zod';
import type { AllTypesOfNodeData } from '../nodes/types';
import { transformHandlesInNodeDataInPlace } from './handleSetters';

/**
 * Strips a trailing numeric suffix of the form " N" (where N >= 2) from a name.
 * Returns the base name and the suffix number (or undefined if none).
 *
 * Examples:
 *   "Value 3"  → { base: "Value", suffix: 3 }
 *   "Value"    → { base: "Value", suffix: undefined }
 *   "Item 1"   → { base: "Item 1", suffix: undefined }  (1 is not ≥ 2)
 *   ""         → { base: "", suffix: undefined }
 */
function parseNameSuffix(name: string): {
  base: string;
  suffix: number | undefined;
} {
  const match = name.match(/^(.+)\s(\d+)$/);
  if (match) {
    const num = Number(match[2]);
    if (num >= 2) {
      return { base: match[1], suffix: num };
    }
  }
  return { base: name, suffix: undefined };
}

/**
 * Returns a handle name that is unique among `existingNames`.
 *
 * If `proposedName` is not already taken, it is returned as-is.
 * Otherwise, a numeric suffix is appended: "Name 2", "Name 3", etc.
 * If `proposedName` already has a suffix (e.g. "Name 3"), the base
 * is extracted and the next available number is used.
 *
 * Numbering starts at 2 — the unsuffixed original is implicitly #1.
 */
function ensureUniqueHandleName(
  proposedName: string,
  existingNames: ReadonlyArray<string>,
): string {
  if (!existingNames.includes(proposedName)) {
    return proposedName;
  }

  const { base } = parseNameSuffix(proposedName);

  const existingSet = new Set(existingNames);
  let counter = 2;
  while (existingSet.has(`${base} ${counter}`)) {
    counter++;
  }
  return `${base} ${counter}`;
}

/**
 * Walks all inputs and all outputs of an instantiated node and renames any
 * duplicates within each group (inputs deduplicated among inputs, outputs
 * among outputs). Mutates the handles in place via the handle iterator,
 * which correctly flattens panels.
 *
 * Handles are processed in order — the first occurrence keeps its name,
 * subsequent duplicates get suffixed.
 */
function ensureAllHandleNamesUnique<
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  NodeTypeUniqueId extends string = string,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  DataTypeUniqueId extends string = string,
>(
  nodeData: AllTypesOfNodeData<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
): void {
  const seenInputs: string[] = [];
  transformHandlesInNodeDataInPlace<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(
    nodeData,
    (handle) => {
      if (handle.name === undefined) return;
      handle.name = ensureUniqueHandleName(handle.name, seenInputs);
      seenInputs.push(handle.name);
    },
    true,
    false,
  );

  const seenOutputs: string[] = [];
  transformHandlesInNodeDataInPlace<
    UnderlyingType,
    NodeTypeUniqueId,
    ComplexSchemaType,
    DataTypeUniqueId
  >(
    nodeData,
    (handle) => {
      if (handle.name === undefined) return;
      handle.name = ensureUniqueHandleName(handle.name, seenOutputs);
      seenOutputs.push(handle.name);
    },
    false,
    true,
  );
}

export { ensureUniqueHandleName, ensureAllHandleNamesUnique };
