import type { State } from '@/utils/nodeStateManagement/types';
import {
  standardDataTypes,
  standardNodeTypes,
} from '@/utils/nodeStateManagement/standardNodes';

export type StdDataTypeId = keyof typeof standardDataTypes;
export type StdNodeTypeId = keyof typeof standardNodeTypes;

export type StdState = State<StdDataTypeId, StdNodeTypeId>;

/** A minimal valid State with the standard data/node types and no instances. */
export function createStandardState(): StdState {
  return {
    dataTypes: { ...standardDataTypes } as StdState['dataTypes'],
    typeOfNodes: { ...standardNodeTypes } as StdState['typeOfNodes'],
    nodes: [],
    edges: [],
  };
}
