import type {
  TypeOfInput,
  TypeOfInputPanel,
} from '@/utils/nodeStateManagement/types';
import type { DragListItem } from '@/components/molecules/DragList/types';
import { generateRandomString } from '@/utils/randomGeneration';

type InputAdditionalProps = {
  dataType: string;
  allowInput?: boolean;
  maxConnections?: number;
};

function typeOfInputsToDragListItems(
  inputs: (TypeOfInput | TypeOfInputPanel)[],
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
): DragListItem<InputAdditionalProps>[] {
  return outputs.map((output) => ({
    id: generateRandomString(20),
    name: output.name,
    additionalProperties: {
      dataType: output.dataType,
      allowInput: output.allowInput,
      maxConnections: output.maxConnections,
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
export type { InputAdditionalProps };
