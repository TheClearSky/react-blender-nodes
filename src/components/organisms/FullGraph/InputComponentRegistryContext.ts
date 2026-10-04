import { createContext, useContext } from 'react';
import type { ComponentType } from 'react';

type InputComponentProps = {
  value: unknown;
  onChange: (value: unknown) => void;
  name: string;
  dataTypeId: string;
  /** The node type's limits for this socket (`TypeOfInput.min/max/step`),
   *  when it declares them. */
  min?: number;
  max?: number;
  step?: number;
};

type InputComponentRegistry<DataTypeUniqueId extends string = string> = Partial<
  Record<DataTypeUniqueId, ComponentType<InputComponentProps>>
>;

const InputComponentRegistryContext = createContext<
  InputComponentRegistry | undefined
>(undefined);

function useInputComponentRegistry(): InputComponentRegistry | undefined {
  return useContext(InputComponentRegistryContext);
}

export { InputComponentRegistryContext, useInputComponentRegistry };
export type { InputComponentProps, InputComponentRegistry };
