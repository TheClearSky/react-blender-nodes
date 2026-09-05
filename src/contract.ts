/**
 * @fileoverview React-free codegen contract surface.
 *
 * This is the second published entry point of the library, exposed as the
 * `@theclearsky/react-blender-nodes/contract` subpath. It re-exports ONLY the
 * runner IR / state types + the handful of pure runtime helpers that the
 * `@theclearsky/react-blender-nodes-codegen` plugin needs — and NOTHING from the
 * React/editor surface. Its value-import graph
 * (`handleClassifiers` → `standardNodes` → `nodeStateManagement/types` → `zod`,
 * plus the import-free `valueStore` helpers / `readInput` / `downloadTextArtifact`)
 * is React- and `@xyflow/react`-free BY CONSTRUCTION, so the built
 * `dist/react-blender-nodes-contract.*` bundle loads headlessly under Node.
 *
 * The four runtime classifiers (`getDataHandleIds`, `findConditionInputId`,
 * `qualifiedId`, `flattenInputs`) are the executor's OWN helpers — re-exported
 * (never duplicated) so codegen matches the runtime by construction.
 *
 * Type-only re-exports use `export type` (values and types are split per
 * `verbatimModuleSyntax`). `dist/contract.d.ts` therefore imports `@xyflow/react`,
 * `immer`, `react` (via `ArtifactRunTarget.icon`), and `zod` as TYPES only; the
 * consumer supplies those type packages (as it already does for the root entry).
 */

// ── Values (6) — pure, React-free runtime helpers ────────────────────────────
export {
  getDataHandleIds,
  findConditionInputId,
} from './utils/nodeRunner/executor/handleClassifiers';
export { qualifiedId, flattenInputs } from './utils/nodeRunner/valueStore';
export { readInput } from './utils/nodeRunner/readInput';
export { downloadTextArtifact } from './utils/nodeRunner/runTargets/downloadTextArtifact';

// ── Types — runner IR, graph state, and the run-target contract ──────────────
export type {
  ExecutionPlan,
  ExecutionStep,
  StandardExecutionStep,
  LoopExecutionBlock,
  SwitchExecutionBlock,
  GroupExecutionScope,
} from './utils/nodeRunner/types';
export type {
  State,
  SupportedUnderlyingTypes,
} from './utils/nodeStateManagement/types';
export type {
  MinimalNodeData,
  MinimalInput,
  MinimalInputPanel,
  MinimalOutput,
} from './utils/nodeRunner/valueStore';
export type { ReadableInputHandle } from './utils/nodeRunner/readInput';
export type {
  ArtifactRunContext,
  ArtifactRunTarget,
} from './utils/nodeRunner/runTargets/types';
