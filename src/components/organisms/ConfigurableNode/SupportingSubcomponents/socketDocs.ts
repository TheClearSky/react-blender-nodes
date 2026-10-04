import { createContext } from 'react';
import { handleKey } from '@/utils/nodeStateManagement/handles/handleKey';

/** What a node TYPE says about one of its sockets — read live at render. */
type SocketDoc = {
  description?: string;
  min?: number;
  max?: number;
  step?: number;
};

type SocketDocs = ReadonlyMap<string, SocketDoc>;

type TypeOfHandleLike = {
  name: string;
  dataType: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
};

type TypeOfNodeLike = {
  inputs?: ReadonlyArray<
    TypeOfHandleLike | { name: string; inputs: TypeOfHandleLike[] }
  >;
  outputs?: ReadonlyArray<TypeOfHandleLike>;
};

/** Key for one side's socket: sides are separate (an input and an output may
 *  share a name and a data type). */
function socketDocKey(
  side: 'in' | 'out',
  name: string,
  dataTypeUniqueId: string | undefined,
): string {
  return `${side}:${handleKey(name, dataTypeUniqueId)}`;
}

/**
 * The socket documentation of a node type, by socket. Instances are matched to
 * their type's inputs/outputs the same way reconstruction does (name + data
 * type); pass-through handles of loops, switches and group I/O have no type
 * entry and simply get nothing.
 */
function buildSocketDocs(typeOfNode: TypeOfNodeLike | undefined): SocketDocs {
  const docs = new Map<string, SocketDoc>();
  if (!typeOfNode) return docs;
  const add = (side: 'in' | 'out', handle: TypeOfHandleLike) => {
    // Imported types are untrusted: keep only well-typed fields.
    const description =
      typeof handle.description === 'string' && handle.description.trim() !== ''
        ? handle.description
        : undefined;
    const finite = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    const min = finite(handle.min);
    const max = finite(handle.max);
    const step = finite(handle.step);
    if (
      description === undefined &&
      min === undefined &&
      max === undefined &&
      step === undefined
    ) {
      return;
    }
    docs.set(socketDocKey(side, handle.name, handle.dataType), {
      description,
      min,
      max,
      step,
    });
  };
  for (const item of typeOfNode.inputs ?? []) {
    if ('inputs' in item) for (const input of item.inputs) add('in', input);
    else add('in', item);
  }
  for (const output of typeOfNode.outputs ?? []) add('out', output);
  return docs;
}

const SocketDocsContext = createContext<SocketDocs>(new Map());

export { buildSocketDocs, socketDocKey, SocketDocsContext };
export type { SocketDoc, SocketDocs };
