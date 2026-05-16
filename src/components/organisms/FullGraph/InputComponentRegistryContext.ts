import { createContext, useContext } from 'react';
import type { ComponentType } from 'react';

type InputComponentProps = {
  value: unknown;
  onChange: (value: unknown) => void;
  name: string;
  dataTypeId: string;
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
