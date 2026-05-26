export {
  isSwitchNode,
  getSwitchNodeInferHandleIndex,
} from './switchIdentification';
export { addDuplicateHandlesToSwitchNodesAfterInference } from './switchHandleSync';
export { getSwitchStructureFromNode } from './switchStructure';
export { getNodesInSwitchRegion, getZoneHandleIds } from './switchRegion';
export type { ZoneHandleIds } from './switchRegion';
export { isSwitchConnectionValid } from './switchValidation';
export type { SwitchStructure } from './types';
