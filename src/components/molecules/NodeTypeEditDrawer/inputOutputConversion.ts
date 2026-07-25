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
};

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
