import type { standardNodeTypeNames } from '../nodeStateManagement/standardNodes';

type FunctionImplementations<NodeTypeUniqueId extends string = string> = {
  [key in Exclude<NodeTypeUniqueId, (typeof standardNodeTypeNames)[number]>]: (
    ...args: any[][]
  ) => any;
};

export type { FunctionImplementations };
