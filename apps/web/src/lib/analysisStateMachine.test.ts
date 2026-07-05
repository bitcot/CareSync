import { describe, it, expect } from 'vitest';
import {
  analysisGraphReducer,
  initialAnalysisGraphState,
  type AnalysisGraphAction,
  type AnalysisGraphState,
} from './analysisStateMachine';

/**
 * One full realistic run, phased per-agent (risk → careGap → sdoh →
 * actionPlanner → done) — the order `replayCachedAnalysis` in
 * `apps/api/src/routes/analysis.ts` actually emits, and a live run's
 * eventual per-agent order too (risk/careGap/sdoh run in parallel and can
 * interleave live, but this pure state-machine test only cares about
 * per-agent ordering, which phased blocks exercise just as well).
 */
const FIXTURE: AnalysisGraphAction[] = [
  { event: 'token', agentId: 'risk' },
  { event: 'token', agentId: 'risk' },
  { event: 'finding', agentId: 'risk' },
  { event: 'finding', agentId: 'risk' },
  { event: 'complete', agentId: 'risk' },

  { event: 'token', agentId: 'careGap' },
  { event: 'finding', agentId: 'careGap' },
  { event: 'complete', agentId: 'careGap' },

  { event: 'token', agentId: 'sdoh' },
  { event: 'finding', agentId: 'sdoh' },
  { event: 'complete', agentId: 'sdoh' },

  { event: 'token', agentId: 'actionPlanner' },
  { event: 'finding', agentId: 'actionPlanner' },
  { event: 'task', agentId: 'actionPlanner' },
  { event: 'task', agentId: 'actionPlanner' },
  { event: 'complete', agentId: 'actionPlanner' },

  { event: 'done' },
];

/** Runs the fixture through the reducer, recording the state snapshot after each action. */
function runFixture(actions: AnalysisGraphAction[]): AnalysisGraphState[] {
  const snapshots: AnalysisGraphState[] = [];
  let state = initialAnalysisGraphState;
  for (const action of actions) {
    state = analysisGraphReducer(state, action);
    snapshots.push(state);
  }
  return snapshots;
}

describe('analysisGraphReducer', () => {
  it('starts idle with all four nodes pending', () => {
    expect(initialAnalysisGraphState).toEqual({
      graphState: 'idle',
      nodes: { risk: 'pending', careGap: 'pending', sdoh: 'pending', actionPlanner: 'pending' },
    });
  });

  it('drives the documented event sequence through graph states in order', () => {
    const snapshots = runFixture(FIXTURE);

    // INIT→DISPATCH: fires immediately, on the very first event of the run.
    expect(snapshots[0].graphState).toBe('dispatch');
    // Every subsequent event before actionPlanner's first tagged event
    // keeps the graph in the parallel-analysis phase.
    expect(snapshots[1].graphState).toBe('analyzing');
    expect(snapshots[4].graphState).toBe('analyzing'); // complete(risk) — graph itself isn't done
    expect(snapshots[7].graphState).toBe('analyzing'); // complete(careGap)
    expect(snapshots[10].graphState).toBe('analyzing'); // complete(sdoh)

    // SYNTHESIZING: fires on actionPlanner's FIRST tagged event (index 11 = token(actionPlanner)).
    expect(snapshots[11].graphState).toBe('synthesizing');
    // Stays synthesizing through actionPlanner's remaining events, including its own complete.
    expect(snapshots[12].graphState).toBe('synthesizing');
    expect(snapshots[13].graphState).toBe('synthesizing');
    expect(snapshots[14].graphState).toBe('synthesizing');
    expect(snapshots[15].graphState).toBe('synthesizing'); // complete(actionPlanner)

    // Graph-level COMPLETE only on the terminal `done` event.
    const last = snapshots[snapshots.length - 1];
    expect(last.graphState).toBe('complete');
  });

  it('flips a node to analyzing on its first tagged event, independent of other agents', () => {
    const snapshots = runFixture(FIXTURE);

    // risk's first event (index 0) flips risk to analyzing while the other three stay pending.
    expect(snapshots[0].nodes).toEqual({
      risk: 'analyzing',
      careGap: 'pending',
      sdoh: 'pending',
      actionPlanner: 'pending',
    });

    // careGap's first event (index 5) flips careGap to analyzing; risk is already complete by then.
    expect(snapshots[5].nodes.risk).toBe('complete');
    expect(snapshots[5].nodes.careGap).toBe('analyzing');
    expect(snapshots[5].nodes.sdoh).toBe('pending');
    expect(snapshots[5].nodes.actionPlanner).toBe('pending');
  });

  it('flips a node to complete on its own complete event, independent of other agents', () => {
    const snapshots = runFixture(FIXTURE);

    expect(snapshots[4].nodes.risk).toBe('complete'); // complete(risk)
    expect(snapshots[4].nodes.careGap).toBe('pending'); // untouched
    expect(snapshots[4].nodes.sdoh).toBe('pending');
    expect(snapshots[4].nodes.actionPlanner).toBe('pending');

    expect(snapshots[7].nodes.careGap).toBe('complete'); // complete(careGap)
    expect(snapshots[10].nodes.sdoh).toBe('complete'); // complete(sdoh)
    expect(snapshots[15].nodes.actionPlanner).toBe('complete'); // complete(actionPlanner)

    // Final state: every node complete, graph complete.
    const last = snapshots[snapshots.length - 1];
    expect(last.nodes).toEqual({ risk: 'complete', careGap: 'complete', sdoh: 'complete', actionPlanner: 'complete' });
  });

  it('supports an explicit start action (idle → init) ahead of the first SSE event, for real hook usage', () => {
    const afterStart = analysisGraphReducer(initialAnalysisGraphState, { event: 'start' });
    expect(afterStart.graphState).toBe('init');

    const afterFirstEvent = analysisGraphReducer(afterStart, { event: 'token', agentId: 'risk' });
    expect(afterFirstEvent.graphState).toBe('dispatch');
    expect(afterFirstEvent.nodes.risk).toBe('analyzing');
  });
});
