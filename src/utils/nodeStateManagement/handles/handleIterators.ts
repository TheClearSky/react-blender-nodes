import type { SupportedUnderlyingTypes } from '../types';
import { z } from 'zod';
import type {
  AllTypesOfHandles,
  HandleAndRelatedInformation,
  HandleAndRelatedInformationWhenNotFound,
  NonPanelTypesOfHandles,
} from './types';

function getResultantIndexIncludingNegativeIndices(
  index: number,
  arrayLength: number,
): number {
  return index >= 0 ? index : index + arrayLength;
}

function advanceIndexIncludingNegativeIndices(index: number): number {
  return index >= 0 ? index + 1 : index - 1;
}

function isIndexInArrayIncludingNegativeIndices(
  index: number,
  arrayLength: number,
): boolean {
  const resultantIndex = getResultantIndexIncludingNegativeIndices(
    index,
    arrayLength,
  );
  return resultantIndex >= 0 && resultantIndex < arrayLength;
}

function handleIteratorIncludingIndices<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  TypeSupplied extends AllTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = AllTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
>(
  inputsOrOutputs: TypeSupplied,
  typeInIndices: 'input' | 'output',
  startFromIndices:
    | { index1: number | undefined; index2: number | undefined }
    | undefined = undefined,
): IteratorObject<
  HandleAndRelatedInformation<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    TypeSupplied
  >,
  HandleAndRelatedInformationWhenNotFound<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    TypeSupplied
  >
> {
  let nextIndex1 = startFromIndices?.index1 ?? 0;
  let nextIndex2 = startFromIndices?.index2 ?? 0;
  const iterator = Iterator.from({
    next: function (): IteratorResult<
      HandleAndRelatedInformation<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType,
        TypeSupplied
      >,
      HandleAndRelatedInformationWhenNotFound<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType,
        TypeSupplied
      >
    > {
      if (
        !isIndexInArrayIncludingNegativeIndices(
          nextIndex1,
          inputsOrOutputs.length,
        )
      ) {
        return {
          value: {
            value: undefined,
            handleIndices: {
              type: typeInIndices,
              index1: nextIndex1,
              index2: undefined,
            },
            parentArray: inputsOrOutputs,
            parentArrayIndex: nextIndex1,
          },
          done: true,
        };
      }
      const inputOrOutput =
        inputsOrOutputs[
          getResultantIndexIncludingNegativeIndices(
            nextIndex1,
            inputsOrOutputs.length,
          )
        ];
      if (!('inputs' in inputOrOutput)) {
        const index1Before = nextIndex1;
        nextIndex1 = advanceIndexIncludingNegativeIndices(nextIndex1);
        nextIndex2 = 0;
        //@ts-expect-error - we know that the value is not a ConfigurableNodeInputPanel
        const finalValue: NonPanelTypesOfHandles<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType,
          TypeSupplied
        > = inputOrOutput;
        return {
          value: {
            value: finalValue,
            handleIndices: {
              type: typeInIndices,
              index1: index1Before,
              index2: undefined,
            },
            parentArray: inputsOrOutputs,
            parentArrayIndex: index1Before,
          },
          done: false,
        };
      } else {
        if (
          !isIndexInArrayIncludingNegativeIndices(
            nextIndex2,
            inputOrOutput.inputs.length,
          )
        ) {
          return {
            value: {
              value: undefined,
              handleIndices: {
                type: 'input',
                index1: nextIndex1,
                index2: nextIndex2,
              },
              //@ts-expect-error - we know that the value is not a ConfigurableNodeInputPanel
              parentArray: inputOrOutput.inputs,
              parentArrayIndex: nextIndex2,
            },
            done: true,
          };
        }
        const input =
          inputOrOutput.inputs[
            getResultantIndexIncludingNegativeIndices(
              nextIndex2,
              inputOrOutput.inputs.length,
            )
          ];
        const index1Before = nextIndex1;
        const index2Before = nextIndex2;

        let resetIndex2ToZeroOrNegativeOne = false;

        while (true) {
          if (resetIndex2ToZeroOrNegativeOne) {
            nextIndex2 = nextIndex2 >= 0 ? 0 : -1;
            resetIndex2ToZeroOrNegativeOne = false;
          } else {
            nextIndex2 = advanceIndexIncludingNegativeIndices(nextIndex2);
          }
          const currentInputOrOutput =
            inputsOrOutputs[
              getResultantIndexIncludingNegativeIndices(
                nextIndex1,
                inputsOrOutputs.length,
              )
            ];
          if (!currentInputOrOutput || !('inputs' in currentInputOrOutput)) {
            //Not a panel, either out of array or a normal input
            nextIndex2 = 0;
            break;
          }
          if (
            isIndexInArrayIncludingNegativeIndices(
              nextIndex2,
              currentInputOrOutput.inputs.length,
            )
          ) {
            //Found a spot in the panel
            break;
          }
          //Is a panel but no more spots in the panel, go to next panel or input
          nextIndex1 = advanceIndexIncludingNegativeIndices(nextIndex1);
          //This will immediately become 0 on next iteration
          resetIndex2ToZeroOrNegativeOne = true;
        }
        //@ts-expect-error - we know that the value is not a ConfigurableNodeInputPanel
        const finalValue: NonPanelTypesOfHandles<
          DataTypeUniqueId,
          NodeTypeUniqueId,
          UnderlyingType,
          ComplexSchemaType,
          TypeSupplied
        > = input;
        //@ts-expect-error - we know this is parent array, and the error is - output types can't be returned, but output types will never reach here
        const parentArray: TypeSupplied =
          inputsOrOutputs[
            getResultantIndexIncludingNegativeIndices(
              index1Before,
              inputsOrOutputs.length,
            )
          ];
        return {
          value: {
            value: finalValue,
            handleIndices: {
              type: 'input',
              index1: index1Before,
              index2: index2Before,
            },
            parentArray,
            parentArrayIndex: index2Before,
          },
          done: false,
        };
      }
    },
  });
  //@ts-expect-error - we know that the iterator is correct, the constructor of iterator loses the generic type
  return iterator;
}

function handleIterator<
  DataTypeUniqueId extends string = string,
  NodeTypeUniqueId extends string = string,
  UnderlyingType extends SupportedUnderlyingTypes = SupportedUnderlyingTypes,
  ComplexSchemaType extends UnderlyingType extends 'complex'
    ? z.ZodType
    : never = never,
  TypeSupplied extends AllTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  > = AllTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType
  >,
>(
  inputsOrOutputs: TypeSupplied,
  typeInIndices: 'input' | 'output',
): IterableIterator<
  NonPanelTypesOfHandles<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    TypeSupplied
  >
> {
  const iteratorWithIndices = handleIteratorIncludingIndices<
    DataTypeUniqueId,
    NodeTypeUniqueId,
    UnderlyingType,
    ComplexSchemaType,
    TypeSupplied
  >(inputsOrOutputs, typeInIndices);
  const iterator = Iterator.from({
    next: function (): IteratorResult<
      NonPanelTypesOfHandles<
        DataTypeUniqueId,
        NodeTypeUniqueId,
        UnderlyingType,
        ComplexSchemaType,
        TypeSupplied
      >
    > {
      const nextResult = iteratorWithIndices.next();
      if (nextResult.done) {
        return { value: undefined, done: true };
      }
      return {
        value: nextResult.value.value,
        done: false,
      };
    },
  });
  return iterator;
}

export {
  handleIterator,
  handleIteratorIncludingIndices,
  getResultantIndexIncludingNegativeIndices,
  advanceIndexIncludingNegativeIndices,
  isIndexInArrayIncludingNegativeIndices,
};
