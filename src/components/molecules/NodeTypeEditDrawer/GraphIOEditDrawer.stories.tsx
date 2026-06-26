import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { GraphIOEditDrawer, type GraphIOHandleSpec } from './GraphIOEditDrawer';
import { Button } from '@/components/atoms';
import { generateRandomString } from '@/utils/randomGeneration';
import type {
  HandleBlastRadius,
  ConnectionNeighborhood,
} from '@/utils/nodeStateManagement/handles/handleDeletionAnalysis';

const meta = {
  title: 'Molecules/GraphIOEditDrawer',
  component: GraphIOEditDrawer,
  args: {
    isOpen: false,
    onClose: () => {},
    variant: 'graphInput',
    nodeId: null,
    handles: [],
    onSave: () => {},
  },
  decorators: [
    (Story) => (
      <div className='relative w-full h-[700px] bg-primary-black overflow-hidden'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GraphIOEditDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Apply a save payload to a local `{ id, name }[]` list, minting ids for new
 *  handles (mirrors what `applyPlan` does for `UPDATE_GRAPH_IO_HANDLES`). */
function applySpecs(
  specs: GraphIOHandleSpec[],
): { id: string; name: string }[] {
  return specs.map((spec) => ({
    id: spec.id ?? generateRandomString(20),
    name: spec.name,
  }));
}

function GraphInputTemplate() {
  const [isOpen, setIsOpen] = useState(false);
  const [handles, setHandles] = useState<{ id: string; name: string }[]>([
    { id: 'h1', name: 'a' },
    { id: 'h2', name: 'b' },
  ]);

  return (
    <>
      <Button size='small' onClick={() => setIsOpen(true)} className='m-4'>
        Edit Graph Input
      </Button>
      <div className='absolute top-0 right-0 m-4 text-primary-white text-xs font-main'>
        <div className='font-medium mb-1'>runGraph signature:</div>
        <div className='text-secondary-light-gray'>
          runGraph({handles.map((h) => h.name).join(', ')})
        </div>
      </div>
      <GraphIOEditDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        variant='graphInput'
        nodeId='graph-input-node'
        handles={handles}
        onSave={(_nodeId, specs) => {
          setHandles(applySpecs(specs));
          setIsOpen(false);
        }}
      />
    </>
  );
}

export const GraphInput: Story = {
  render: () => <GraphInputTemplate />,
};

function GraphOutputTemplate() {
  const [isOpen, setIsOpen] = useState(false);
  const [handles, setHandles] = useState<{ id: string; name: string }[]>([
    { id: 'o1', name: 'sum' },
    { id: 'o2', name: 'carry' },
  ]);

  return (
    <>
      <Button size='small' onClick={() => setIsOpen(true)} className='m-4'>
        Edit Graph Output
      </Button>
      <div className='absolute top-0 right-0 m-4 text-primary-white text-xs font-main'>
        <div className='font-medium mb-1'>runGraph returns:</div>
        <div className='text-secondary-light-gray'>
          {`{ ${handles.map((h) => `${h.name}: …`).join(', ')} }`}
        </div>
      </div>
      <GraphIOEditDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        variant='graphOutput'
        nodeId='graph-output-node'
        handles={handles}
        onSave={(_nodeId, specs) => {
          setHandles(applySpecs(specs));
          setIsOpen(false);
        }}
      />
    </>
  );
}

export const GraphOutput: Story = {
  render: () => <GraphOutputTemplate />,
};

function EmptyGraphInputTemplate() {
  const [isOpen, setIsOpen] = useState(false);
  const [handles, setHandles] = useState<{ id: string; name: string }[]>([]);

  return (
    <>
      <Button size='small' onClick={() => setIsOpen(true)} className='m-4'>
        Edit Empty Graph Input
      </Button>
      <GraphIOEditDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        variant='graphInput'
        nodeId='empty-graph-input'
        handles={handles}
        onSave={(_nodeId, specs) => {
          setHandles(applySpecs(specs));
          setIsOpen(false);
        }}
      />
    </>
  );
}

export const EmptyGraphInput: Story = {
  render: () => <EmptyGraphInputTemplate />,
};

// ---------------------------------------------------------------------------
// E3 — deletion blast-radius review (parity with NodeTypeEditDrawer). Wiring
// `getHandleBlastRadius` + `getNeighborhood` enables the per-row Info button
// (HandleSummaryModal) and "Save & Review Deletions" (DeletionReviewModal).
// ---------------------------------------------------------------------------

const STORY_NEIGHBORHOOD: ConnectionNeighborhood = {
  nodes: [],
  edges: [],
  highlightEdgeId: null,
};

/** A mock blast radius: pretend each Graph Output handle feeds two upstream
 *  edges, so the review modal shows breaking connections. */
function mockGraphOutputBlastRadius(handle: {
  id: string;
  name: string;
}): HandleBlastRadius {
  return {
    target: {
      direction: 'input',
      handleName: handle.name,
      handleDataTypeId: '',
    },
    scopes: [
      {
        scopeId: 'root',
        scopeLabel: 'Root graph',
        isOwnInternalSubtree: false,
        instanceManifestations: 1,
        connections: [0, 1].map((index) => ({
          edgeId: `${handle.id}-e${index}`,
          sourceNodeId: `src${index}`,
          sourceNodeName: `Producer ${index}`,
          sourceHandleName: 'out',
          targetNodeId: 'graph-output-node',
          targetNodeName: 'Graph Output',
          targetHandleName: handle.name,
        })),
      },
    ],
    totalConnections: 2,
  };
}

function GraphOutputWithReviewTemplate() {
  const [isOpen, setIsOpen] = useState(false);
  const [handles, setHandles] = useState<{ id: string; name: string }[]>([
    { id: 'o1', name: 'sum' },
    { id: 'o2', name: 'carry' },
    { id: 'o3', name: 'debug' },
  ]);

  return (
    <>
      <Button size='small' onClick={() => setIsOpen(true)} className='m-4'>
        Edit Graph Output (with deletion review)
      </Button>
      <GraphIOEditDrawer
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        variant='graphOutput'
        nodeId='graph-output-node'
        handles={handles}
        onSave={(_nodeId, specs) => {
          setHandles(applySpecs(specs));
          setIsOpen(false);
        }}
        getHandleBlastRadius={(_nodeId, handle) =>
          mockGraphOutputBlastRadius(handle)
        }
        getNeighborhood={() => STORY_NEIGHBORHOOD}
      />
    </>
  );
}

export const GraphOutputWithDeletionReview: Story = {
  render: () => <GraphOutputWithReviewTemplate />,
};
