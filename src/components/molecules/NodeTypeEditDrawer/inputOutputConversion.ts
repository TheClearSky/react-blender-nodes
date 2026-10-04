import type {
  TypeOfInput,
  TypeOfInputPanel,
} from '@/utils/nodeStateManagement/types';
import type { DragListItem } from '@/components/molecules/DragList/types';
import { generateRandomString } from '@/utils/randomGeneration';
import type { HandleShape } from '@/components/atoms/HandleShapeSwatch/handleShapes';

type InputAdditionalProps = {
  dataType: string;
  allowInput?: boolean;
  maxConnections?: number;
  /** Data-type color for the editor swatch (display-only; never round-trips). */
  color?: string;
  /** Data-type shape for the editor swatch (display-only; never round-trips). */
  shape?: HandleShape;
  // The rest of TypeOfInput, CARRIED through the editor untouched (the editor
  // round-trip used to drop every field it did not list — `defaultValue` was
  // silently lost on every Save). `description` is also edited here.
  defaultValue?: string | number | boolean;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
};

/** The TypeOfInput fields the editor carries through as-is. */
const CARRIED = ['defaultValue', 'description', 'min', 'max', 'step'] as const;

function carriedFrom(input: TypeOfInput): Partial<InputAdditionalProps> {
  const out: Partial<InputAdditionalProps> = {};
  for (const key of CARRIED) {
    if (input[key] !== undefined)
      (out as Record<string, unknown>)[key] = input[key];
  }
  return out;
}

function carriedTo(
  props: InputAdditionalProps | undefined,
): Partial<TypeOfInput> {
  const out: Partial<TypeOfInput> = {};
  for (const key of CARRIED) {
    const value = props?.[key];
    // A blank description is "no description".
    if (value === undefined || (key === 'description' && value === ''))
      continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/** The visual (color + shape) resolved for a data type, for the editor swatch. */
type HandleVisual = { color?: string; shape?: HandleShape };

/** Resolves a data-type id to its swatch visual. Display-only. */
type ResolveHandleVisual = (dataTypeId: string) => HandleVisual;

function typeOfInputsToDragListItems(
  inputs: (TypeOfInput | TypeOfInputPanel)[],
  resolveVisual?: ResolveHandleVisual,
): DragListItem<InputAdditionalProps>[] {
  return inputs.map((input) => {
    if ('inputs' in input) {
      return {
        id: generateRandomString(20),
        name: input.name,
        subTrees: input.inputs.map((subInput) => ({
          id: generateRandomString(20),
          name: subInput.name,
          additionalProperties: {
            dataType: subInput.dataType,
            allowInput: subInput.allowInput,
            maxConnections: subInput.maxConnections,
            ...carriedFrom(subInput),
            ...resolveVisual?.(subInput.dataType),
          },
        })),
      };
    }
    return {
      id: generateRandomString(20),
      name: input.name,
      additionalProperties: {
        dataType: input.dataType,
        allowInput: input.allowInput,
        maxConnections: input.maxConnections,
        ...carriedFrom(input),
        ...resolveVisual?.(input.dataType),
      },
    };
  });
}

function dragListItemsToTypeOfInputs(
  items: DragListItem<InputAdditionalProps>[],
): (TypeOfInput | TypeOfInputPanel)[] {
  return items.map((item) => {
    if ('subTrees' in item) {
      return {
        name: item.name,
        inputs: item.subTrees.map((subItem) => ({
          name: subItem.name,
          dataType: subItem.additionalProperties!.dataType,
          ...(subItem.additionalProperties?.allowInput !== undefined && {
            allowInput: subItem.additionalProperties.allowInput,
          }),
          ...(subItem.additionalProperties?.maxConnections !== undefined && {
            maxConnections: subItem.additionalProperties.maxConnections,
          }),
          ...carriedTo(subItem.additionalProperties),
        })),
      } satisfies TypeOfInputPanel;
    }
    return {
      name: item.name,
      dataType: item.additionalProperties!.dataType,
      ...(item.additionalProperties?.allowInput !== undefined && {
        allowInput: item.additionalProperties.allowInput,
      }),
      ...(item.additionalProperties?.maxConnections !== undefined && {
        maxConnections: item.additionalProperties.maxConnections,
      }),
      ...carriedTo(item.additionalProperties),
    } satisfies TypeOfInput;
  });
}

function typeOfOutputsToDragListItems(
  outputs: TypeOfInput[],
  resolveVisual?: ResolveHandleVisual,
): DragListItem<InputAdditionalProps>[] {
  return outputs.map((output) => ({
    id: generateRandomString(20),
    name: output.name,
    additionalProperties: {
      dataType: output.dataType,
      allowInput: output.allowInput,
      maxConnections: output.maxConnections,
      ...carriedFrom(output),
      ...resolveVisual?.(output.dataType),
    },
  }));
}

function dragListItemsToTypeOfOutputs(
  items: DragListItem<InputAdditionalProps>[],
): TypeOfInput[] {
  return items.map((item) => ({
    name: item.name,
    dataType: item.additionalProperties!.dataType,
    ...(item.additionalProperties?.allowInput !== undefined && {
      allowInput: item.additionalProperties.allowInput,
    }),
    ...(item.additionalProperties?.maxConnections !== undefined && {
      maxConnections: item.additionalProperties.maxConnections,
    }),
    ...carriedTo(item.additionalProperties),
  }));
}

function hasEmptyPanels(items: DragListItem<InputAdditionalProps>[]): boolean {
  return items.some((item) => 'subTrees' in item && item.subTrees.length === 0);
}

export {
  typeOfInputsToDragListItems,
  dragListItemsToTypeOfInputs,
  typeOfOutputsToDragListItems,
  dragListItemsToTypeOfOutputs,
  hasEmptyPanels,
};
export type { InputAdditionalProps, HandleVisual, ResolveHandleVisual };
