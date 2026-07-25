/**
 * Shared constants for E2E tests.
 *
 * Any label, menu path, story id, or timeout that tests might reference goes
 * here so tests never hardcode strings. Changing a menu label becomes a single
 * edit.
 */

// ─────────────────────────────────────────────────────
// Storybook story ids
// ─────────────────────────────────────────────────────

const STORY_EMPTY_RUNNER = 'organisms-fullgraph--empty-runner-playground';
const STORY_WITH_RUNNER = 'organisms-fullgraph--with-runner';
const STORY_PLAYGROUND = 'organisms-fullgraph--playground';
const STORY_CUSTOM_INPUT = 'organisms-fullgraph--custom-input-components';
const STORY_RUNNER_FIXTURE_DEMOS = 'organisms-fullgraph--runner-fixture-demos';

// ─────────────────────────────────────────────────────
// Context menu paths (folderPath for addNodeViaContextMenu)
// ─────────────────────────────────────────────────────

const MENU_PATH_STANDARD = ['Add Node', 'Standard Nodes'];
const MENU_PATH_LOGIC = ['Add Node', 'Logic Gates'];
const MENU_PATH_UTILITY = ['Add Node', 'Utility'];
const MENU_PATH_IO = ['Add Node', 'I/O'];

// ─────────────────────────────────────────────────────
// Node names (exact labels as shown in the context menu)
// ─────────────────────────────────────────────────────

const NODE_GROUP_INPUT = 'Group Input';
const NODE_GROUP_OUTPUT = 'Group Output';
const NODE_LOOP_START = 'Loop Start';
const NODE_LOOP_STOP = 'Loop Stop';
const NODE_LOOP_END = 'Loop End';
const NODE_COUNTER = 'Counter';
const NODE_BUFFER = 'Buffer';
const NODE_BIT_INPUT = 'Bit Input';
const NODE_BIT_OUTPUT = 'Bit Output';
const NODE_AND_GATE = 'AND Gate';
const NODE_OR_GATE = 'OR Gate';
const NODE_NOT_GATE = 'NOT Gate';
const NODE_XOR_GATE = 'XOR Gate';
const NODE_NAND_GATE = 'NAND Gate';
const NODE_NOR_GATE = 'NOR Gate';
const NODE_CONFIGURABLE_GATE = 'Configurable Gate';

// ─────────────────────────────────────────────────────
// Handle names (the label text rendered next to each handle)
// ─────────────────────────────────────────────────────

const HANDLE_BIND_LOOP_NODES = 'Bind Loop Nodes';
const HANDLE_LOOP_CONDITION = 'Continue If Condition Is True';
const HANDLE_COUNTER_COUNT = 'Count';
const HANDLE_COUNTER_MAX = 'Max';
const HANDLE_COUNTER_COUNT_PLUS_ONE = 'Count + 1';
const HANDLE_COUNTER_REACHED_MAX = 'Reached Max';

const HANDLE_GATE_A = 'A';
const HANDLE_GATE_B = 'B';
const HANDLE_GATE_OUT = 'Out';
const HANDLE_GATE_MODE = 'Mode';
const HANDLE_VALUE = 'Value';
const HANDLE_IN = 'In';

const NODE_COLOR_SOURCE = 'Color Source';
const NODE_COLOR_MIXER = 'Color Mixer';
const NODE_COLOR_DISPLAY = 'Color Display';
const HANDLE_COLOR = 'Color';
const HANDLE_COLOR_A = 'Color A';
const HANDLE_COLOR_B = 'Color B';
const HANDLE_RATIO = 'Ratio';
const HANDLE_MIXED = 'Mixed';
const MENU_PATH_ADD_NODE = ['Add Node'];

// ─────────────────────────────────────────────────────
// Runner state labels (exact text rendered in RunControls)
// ─────────────────────────────────────────────────────

type RunnerStateLabel =
  | 'Idle'
  | 'Compiling'
  | 'Running'
  | 'Paused'
  | 'Completed'
  | 'Error';

const RUNNER_STATES: readonly RunnerStateLabel[] = [
  'Idle',
  'Compiling',
  'Running',
  'Paused',
  'Completed',
  'Error',
] as const;

// ─────────────────────────────────────────────────────
// Run mode labels (toggle buttons)
// ─────────────────────────────────────────────────────

type RunMode = 'Instant' | 'Step-by-Step';

// ─────────────────────────────────────────────────────
// Timeouts (ms)
// ─────────────────────────────────────────────────────

const T_NODE_VISIBLE = 5000;
const T_RUNNER_COMPLETION = 30000;
// Post-action settle for React's commit to land before we query the DOM.
// Used in dragBetweenLocators / pressDelete to bound the gap between a
// CDP action and the next assertion. Most tests' assertions auto-retry
// (e.g. `toHaveCount`), so this is a small floor not a hard upper bound.
// 100 ms is ~6 animation frames — enough for one React commit + render.
const T_REDUCER_TICK = 100;

// ─────────────────────────────────────────────────────
// DragList story ids
// ─────────────────────────────────────────────────────

const STORY_DRAGLIST_PLAYGROUND = 'molecules-draglist--playground';
const STORY_DRAGLIST_WITH_SUBTREES = 'molecules-draglist--with-subtrees';
const STORY_DRAGLIST_WITH_DELETE = 'molecules-draglist--with-delete';

export {
  STORY_DRAGLIST_PLAYGROUND,
  STORY_DRAGLIST_WITH_SUBTREES,
  STORY_DRAGLIST_WITH_DELETE,
  STORY_EMPTY_RUNNER,
  STORY_WITH_RUNNER,
  STORY_PLAYGROUND,
  STORY_CUSTOM_INPUT,
  STORY_RUNNER_FIXTURE_DEMOS,
  MENU_PATH_STANDARD,
  MENU_PATH_LOGIC,
  MENU_PATH_UTILITY,
  MENU_PATH_IO,
  NODE_GROUP_INPUT,
  NODE_GROUP_OUTPUT,
  NODE_LOOP_START,
  NODE_LOOP_STOP,
  NODE_LOOP_END,
  NODE_COUNTER,
  NODE_BUFFER,
  NODE_BIT_INPUT,
  NODE_BIT_OUTPUT,
  NODE_AND_GATE,
  NODE_OR_GATE,
  NODE_NOT_GATE,
  NODE_XOR_GATE,
  NODE_NAND_GATE,
  NODE_NOR_GATE,
  NODE_CONFIGURABLE_GATE,
  HANDLE_BIND_LOOP_NODES,
  HANDLE_LOOP_CONDITION,
  HANDLE_COUNTER_COUNT,
  HANDLE_COUNTER_MAX,
  HANDLE_COUNTER_COUNT_PLUS_ONE,
  HANDLE_COUNTER_REACHED_MAX,
  HANDLE_GATE_A,
  HANDLE_GATE_B,
  HANDLE_GATE_OUT,
  HANDLE_GATE_MODE,
  HANDLE_VALUE,
  HANDLE_IN,
  NODE_COLOR_SOURCE,
  NODE_COLOR_MIXER,
  NODE_COLOR_DISPLAY,
  HANDLE_COLOR,
  HANDLE_COLOR_A,
  HANDLE_COLOR_B,
  HANDLE_RATIO,
  HANDLE_MIXED,
  MENU_PATH_ADD_NODE,
  RUNNER_STATES,
  T_NODE_VISIBLE,
  T_RUNNER_COMPLETION,
  T_REDUCER_TICK,
};
export type { RunnerStateLabel, RunMode };
