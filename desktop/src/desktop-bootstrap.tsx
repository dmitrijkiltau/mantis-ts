/** @jsxImportSource solid-js */
import { createEffect, createSignal, onCleanup, type Component } from 'solid-js';
import { AssistantAvatar } from './avatar';
import { startIdleChatter } from './idle-chatter';
import { UIState } from './ui-state';
import { useUIStateContext } from './state/ui-state-context';

/**
 * Wires UI state and behavior once Solid refs are available.
 */
const DesktopBootstrap: Component = () => {
  const { nodes, uiState, setUiState } = useUIStateContext();
  const [setupComplete, setSetupComplete] = createSignal(false);

  createEffect(() => {
    if (uiState()) {
      return;
    }

    const form = nodes.promptForm();
    const promptInput = nodes.promptInput();
    const historyElement = nodes.historyElement();
    const avatarMount = nodes.avatarMount();
    const moodLabel = nodes.moodLabel();
    const speechBubble = nodes.speechBubble();
    const bubbleAnswer = nodes.bubbleAnswer();
    const logsConsole = nodes.logsConsole();
    const statusSystem = nodes.statusSystem();
    const statusState = nodes.statusState();
    const statusAction = nodes.statusAction();
    const statQueries = nodes.statQueries();
    const statRuntime = nodes.statRuntime();

    if (
      !form
      || !promptInput
      || !historyElement
      || !moodLabel
      || !speechBubble
      || !bubbleAnswer
      || !logsConsole
      || !statusSystem
      || !statusState
      || !statusAction
      || !statQueries
      || !statRuntime
    ) {
      return;
    }

    const avatar = avatarMount ? new AssistantAvatar(avatarMount) : null;
    const state = new UIState(
      avatar,
      moodLabel,
      speechBubble,
      bubbleAnswer,
      logsConsole,
      statusSystem,
      statusState,
      statusAction,
      statQueries,
      statRuntime,
    );

    state.registerTelemetryNodes({
      totalEvaluations: nodes.telemetryTotal(),
      lowScoreCount: nodes.telemetryLowScore(),
      failureCount: nodes.telemetryFailures(),
      toolCallCount: nodes.telemetryToolCalls(),
      averageAttempts: nodes.telemetryAverageAttempts(),
      schemaMismatchCount: nodes.telemetrySchemaMismatch(),
      averageContainer: nodes.telemetryAverages(),
      recentList: nodes.telemetryRecent(),
    });

    state.setMood('idle');
    state.setStatus('OPERATIONAL', 'AWAITING_INPUT', 'NONE');
    setUiState(state);
  });

  createEffect(() => {
    const currentState = uiState();
    if (!currentState || setupComplete()) {
      return;
    }

    const statsInterval = window.setInterval(() => currentState.updateStats(), 1000);

    currentState.addLog('MANTIS Desktop initialized successfully');
    currentState.addLog('System ready for queries');

    startIdleChatter(currentState);
    setSetupComplete(true);

    onCleanup(() => {
      window.clearInterval(statsInterval);
    });
  });

  return null;
};

export default DesktopBootstrap;
