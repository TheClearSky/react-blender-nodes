import { describe, it, expect } from 'vitest';
import {
  RUNNER_DRAWER_ID,
  nextOpenDrawerIdForRunner,
  resolveOpenDrawerId,
  resolveRunnerOpenAction,
  sanitizeBottomDrawers,
  type BottomDrawerDescriptor,
} from '@/components/organisms/FullGraph/bottomDrawers';

const runner: BottomDrawerDescriptor = {
  id: RUNNER_DRAWER_ID,
  label: 'Runner',
};
const timeline: BottomDrawerDescriptor = { id: 'timeline', label: 'Timeline' };
const notes: BottomDrawerDescriptor = { id: 'notes', label: 'Notes' };

describe('resolveOpenDrawerId', () => {
  it('keeps an id that is registered', () => {
    expect(resolveOpenDrawerId('timeline', [runner, timeline])).toBe(
      'timeline',
    );
    expect(resolveOpenDrawerId(RUNNER_DRAWER_ID, [runner, timeline])).toBe(
      RUNNER_DRAWER_ID,
    );
  });

  it('reads an UNREGISTERED id as closed (consumer removed the drawer / runner unmounted)', () => {
    expect(resolveOpenDrawerId('timeline', [runner])).toBeNull();
    expect(resolveOpenDrawerId(RUNNER_DRAWER_ID, [timeline])).toBeNull();
    expect(resolveOpenDrawerId('anything', [])).toBeNull();
  });

  it('passes null through', () => {
    expect(resolveOpenDrawerId(null, [runner, timeline])).toBeNull();
  });
});

describe('nextOpenDrawerIdForRunner (the legacy boolean setter mapped onto one id)', () => {
  it('opening the runner takes over from whatever was open (one at a time)', () => {
    expect(nextOpenDrawerIdForRunner(null, true)).toBe(RUNNER_DRAWER_ID);
    expect(nextOpenDrawerIdForRunner('timeline', true)).toBe(RUNNER_DRAWER_ID);
    expect(nextOpenDrawerIdForRunner(RUNNER_DRAWER_ID, true)).toBe(
      RUNNER_DRAWER_ID,
    );
  });

  it('closing the runner closes it', () => {
    expect(nextOpenDrawerIdForRunner(RUNNER_DRAWER_ID, false)).toBeNull();
  });

  it('closing the runner while a DIFFERENT drawer is open leaves that drawer alone (O-BD2)', () => {
    expect(nextOpenDrawerIdForRunner('timeline', false)).toBe('timeline');
    expect(nextOpenDrawerIdForRunner(null, false)).toBeNull();
  });
});

describe('resolveRunnerOpenAction (SetStateAction<boolean> → next open id)', () => {
  it('plain booleans behave exactly like nextOpenDrawerIdForRunner', () => {
    expect(resolveRunnerOpenAction(null, true)).toBe(RUNNER_DRAWER_ID);
    expect(resolveRunnerOpenAction('timeline', true)).toBe(RUNNER_DRAWER_ID);
    expect(resolveRunnerOpenAction(RUNNER_DRAWER_ID, false)).toBeNull();
    expect(resolveRunnerOpenAction('timeline', false)).toBe('timeline');
  });

  it('an updater sees "is the runner the open drawer?" — true only when the stored id IS the runner', () => {
    const seen: boolean[] = [];
    const record = (value: boolean) => {
      seen.push(value);
      return value;
    };
    resolveRunnerOpenAction(RUNNER_DRAWER_ID, record);
    resolveRunnerOpenAction('timeline', record);
    resolveRunnerOpenAction(null, record);
    expect(seen).toEqual([true, false, false]);
  });

  it('a toggle updater (v => !v) opens the runner from any non-runner state and closes it from the runner', () => {
    const toggle = (value: boolean) => !value;
    expect(resolveRunnerOpenAction(RUNNER_DRAWER_ID, toggle)).toBeNull();
    expect(resolveRunnerOpenAction('timeline', toggle)).toBe(RUNNER_DRAWER_ID);
    expect(resolveRunnerOpenAction(null, toggle)).toBe(RUNNER_DRAWER_ID);
  });

  it('an updater returning false while a consumer drawer is open leaves that drawer alone (O-BD2 via updater)', () => {
    expect(resolveRunnerOpenAction('timeline', () => false)).toBe('timeline');
  });
});

describe('sanitizeBottomDrawers', () => {
  it('passes a clean list through unchanged and in order', () => {
    const result = sanitizeBottomDrawers([timeline, notes]);
    expect(result.drawers).toEqual([timeline, notes]);
    expect(result.problems).toEqual([]);
  });

  it('treats undefined as an empty list', () => {
    expect(sanitizeBottomDrawers(undefined)).toEqual({
      drawers: [],
      problems: [],
    });
  });

  it("drops a consumer drawer that claims the reserved 'runner' id, and says so", () => {
    const result = sanitizeBottomDrawers([
      { id: RUNNER_DRAWER_ID, label: 'Impostor' },
      timeline,
    ]);
    expect(result.drawers).toEqual([timeline]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("'runner' is reserved");
    expect(result.problems[0]).toContain('Impostor');
  });

  it('keeps only the FIRST drawer of a duplicated id (a duplicate would let two open at once)', () => {
    const first = { id: 'dup', label: 'First' };
    const second = { id: 'dup', label: 'Second' };
    const result = sanitizeBottomDrawers([first, second, notes]);
    expect(result.drawers).toEqual([first, notes]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("duplicate id 'dup'");
  });

  it('reports a reserved id AND a duplicate in one list, in input order', () => {
    const result = sanitizeBottomDrawers([
      timeline,
      { id: RUNNER_DRAWER_ID, label: 'Impostor' },
      { id: 'timeline', label: 'Timeline again' },
      notes,
    ]);
    expect(result.drawers).toEqual([timeline, notes]);
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0]).toContain("'runner' is reserved");
    expect(result.problems[1]).toContain("duplicate id 'timeline'");
  });

  it("two drawers both claiming 'runner' are each reported as RESERVED (never as a duplicate)", () => {
    const result = sanitizeBottomDrawers([
      { id: RUNNER_DRAWER_ID, label: 'A' },
      { id: RUNNER_DRAWER_ID, label: 'B' },
    ]);
    expect(result.drawers).toEqual([]);
    expect(result.problems).toHaveLength(2);
    expect(
      result.problems.every((p) => p.includes("'runner' is reserved")),
    ).toBe(true);
  });

  it('an empty-string id is allowed once, like any other id, and deduplicated after that', () => {
    const blank = { id: '', label: 'Blank' };
    const result = sanitizeBottomDrawers([blank, { id: '', label: 'Blank 2' }]);
    expect(result.drawers).toEqual([blank]);
    expect(result.problems).toHaveLength(1);
  });

  it('preserves the drawer object type (content survives on GraphBottomDrawer inputs)', () => {
    const withContent = { ...timeline, content: 'body' };
    const result = sanitizeBottomDrawers([withContent]);
    expect(result.drawers[0]).toBe(withContent);
  });
});
