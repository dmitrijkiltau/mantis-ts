/** @jsxImportSource solid-js */
import {
  createContext,
  createSignal,
  type Accessor,
  type ParentComponent,
  useContext,
} from 'solid-js';
import type { UIState } from '../ui-state';

type UIRefSetters = {
  promptForm: (element: HTMLFormElement) => void;
  promptInput: (element: HTMLTextAreaElement) => void;
  historyElement: (element: HTMLElement) => void;
  avatarMount: (element: HTMLDivElement) => void;
  moodLabel: (element: HTMLElement) => void;
  speechBubble: (element: HTMLElement) => void;
  bubbleAnswer: (element: HTMLElement) => void;
  logsConsole: (element: HTMLElement) => void;
  toolList: (element: HTMLElement) => void;
  toolCountBadge: (element: HTMLElement) => void;
  imageUploadButton: (element: HTMLButtonElement) => void;
  imageCaptureButton: (element: HTMLButtonElement) => void;
  imageUploadInput: (element: HTMLInputElement) => void;
  attachmentRow: (element: HTMLElement) => void;
  attachmentName: (element: HTMLElement) => void;
  attachmentClear: (element: HTMLButtonElement) => void;
  statusSystem: (element: HTMLElement) => void;
  statusState: (element: HTMLElement) => void;
  statusAction: (element: HTMLElement) => void;
  contractModelList: (element: HTMLElement) => void;
  contractModelCount: (element: HTMLElement) => void;
  statQueries: (element: HTMLElement) => void;
  statRuntime: (element: HTMLElement) => void;
  telemetryTotal: (element: HTMLElement) => void;
  telemetryLowScore: (element: HTMLElement) => void;
  telemetryFailures: (element: HTMLElement) => void;
  telemetryAverages: (element: HTMLElement) => void;
  telemetryRecent: (element: HTMLElement) => void;
};

type UINodeAccessors = {
  promptForm: Accessor<HTMLFormElement | null>;
  promptInput: Accessor<HTMLTextAreaElement | null>;
  historyElement: Accessor<HTMLElement | null>;
  avatarMount: Accessor<HTMLDivElement | null>;
  moodLabel: Accessor<HTMLElement | null>;
  speechBubble: Accessor<HTMLElement | null>;
  bubbleAnswer: Accessor<HTMLElement | null>;
  logsConsole: Accessor<HTMLElement | null>;
  toolList: Accessor<HTMLElement | null>;
  toolCountBadge: Accessor<HTMLElement | null>;
  imageUploadButton: Accessor<HTMLButtonElement | null>;
  imageCaptureButton: Accessor<HTMLButtonElement | null>;
  imageUploadInput: Accessor<HTMLInputElement | null>;
  attachmentRow: Accessor<HTMLElement | null>;
  attachmentName: Accessor<HTMLElement | null>;
  attachmentClear: Accessor<HTMLButtonElement | null>;
  statusSystem: Accessor<HTMLElement | null>;
  statusState: Accessor<HTMLElement | null>;
  statusAction: Accessor<HTMLElement | null>;
  contractModelList: Accessor<HTMLElement | null>;
  contractModelCount: Accessor<HTMLElement | null>;
  statQueries: Accessor<HTMLElement | null>;
  statRuntime: Accessor<HTMLElement | null>;
  telemetryTotal: Accessor<HTMLElement | null>;
  telemetryLowScore: Accessor<HTMLElement | null>;
  telemetryFailures: Accessor<HTMLElement | null>;
  telemetryAverages: Accessor<HTMLElement | null>;
  telemetryRecent: Accessor<HTMLElement | null>;
};

type UIStateContextValue = {
  refs: UIRefSetters;
  nodes: UINodeAccessors;
  uiState: Accessor<UIState | null>;
  setUiState: (value: UIState) => void;
};

const UIStateContext = createContext<UIStateContextValue>();

/**
 * Provides UI node refs and the UIState instance.
 */
export const UIStateProvider: ParentComponent = (props) => {
  const [promptForm, setPromptForm] = createSignal<HTMLFormElement | null>(null);
  const [promptInput, setPromptInput] = createSignal<HTMLTextAreaElement | null>(null);
  const [historyElement, setHistoryElement] = createSignal<HTMLElement | null>(null);
  const [avatarMount, setAvatarMount] = createSignal<HTMLDivElement | null>(null);
  const [moodLabel, setMoodLabel] = createSignal<HTMLElement | null>(null);
  const [speechBubble, setSpeechBubble] = createSignal<HTMLElement | null>(null);
  const [bubbleAnswer, setBubbleAnswer] = createSignal<HTMLElement | null>(null);
  const [logsConsole, setLogsConsole] = createSignal<HTMLElement | null>(null);
  const [toolList, setToolList] = createSignal<HTMLElement | null>(null);
  const [toolCountBadge, setToolCountBadge] = createSignal<HTMLElement | null>(null);
  const [imageUploadButton, setImageUploadButton] = createSignal<HTMLButtonElement | null>(null);
  const [imageCaptureButton, setImageCaptureButton] = createSignal<HTMLButtonElement | null>(null);
  const [imageUploadInput, setImageUploadInput] = createSignal<HTMLInputElement | null>(null);
  const [attachmentRow, setAttachmentRow] = createSignal<HTMLElement | null>(null);
  const [attachmentName, setAttachmentName] = createSignal<HTMLElement | null>(null);
  const [attachmentClear, setAttachmentClear] = createSignal<HTMLButtonElement | null>(null);
  const [statusSystem, setStatusSystem] = createSignal<HTMLElement | null>(null);
  const [statusState, setStatusState] = createSignal<HTMLElement | null>(null);
  const [statusAction, setStatusAction] = createSignal<HTMLElement | null>(null);
  const [contractModelList, setContractModelList] = createSignal<HTMLElement | null>(null);
  const [contractModelCount, setContractModelCount] = createSignal<HTMLElement | null>(null);
  const [statQueries, setStatQueries] = createSignal<HTMLElement | null>(null);
  const [statRuntime, setStatRuntime] = createSignal<HTMLElement | null>(null);
  const [telemetryTotal, setTelemetryTotal] = createSignal<HTMLElement | null>(null);
  const [telemetryLowScore, setTelemetryLowScore] = createSignal<HTMLElement | null>(null);
  const [telemetryFailures, setTelemetryFailures] = createSignal<HTMLElement | null>(null);
  const [telemetryAverages, setTelemetryAverages] = createSignal<HTMLElement | null>(null);
  const [telemetryRecent, setTelemetryRecent] = createSignal<HTMLElement | null>(null);
  const [uiState, setUiState] = createSignal<UIState | null>(null);

  const refs: UIRefSetters = {
    promptForm: (element) => setPromptForm(element),
    promptInput: (element) => setPromptInput(element),
    historyElement: (element) => setHistoryElement(element),
    avatarMount: (element) => setAvatarMount(element),
    moodLabel: (element) => setMoodLabel(element),
    speechBubble: (element) => setSpeechBubble(element),
    bubbleAnswer: (element) => setBubbleAnswer(element),
    logsConsole: (element) => setLogsConsole(element),
    toolList: (element) => setToolList(element),
    toolCountBadge: (element) => setToolCountBadge(element),
    imageUploadButton: (element) => setImageUploadButton(element),
    imageCaptureButton: (element) => setImageCaptureButton(element),
    imageUploadInput: (element) => setImageUploadInput(element),
    attachmentRow: (element) => setAttachmentRow(element),
    attachmentName: (element) => setAttachmentName(element),
    attachmentClear: (element) => setAttachmentClear(element),
    statusSystem: (element) => setStatusSystem(element),
    statusState: (element) => setStatusState(element),
    statusAction: (element) => setStatusAction(element),
    contractModelList: (element) => setContractModelList(element),
    contractModelCount: (element) => setContractModelCount(element),
    statQueries: (element) => setStatQueries(element),
    statRuntime: (element) => setStatRuntime(element),
    telemetryTotal: (element) => setTelemetryTotal(element),
    telemetryLowScore: (element) => setTelemetryLowScore(element),
    telemetryFailures: (element) => setTelemetryFailures(element),
    telemetryAverages: (element) => setTelemetryAverages(element),
    telemetryRecent: (element) => setTelemetryRecent(element),
  };

  const nodes: UINodeAccessors = {
    promptForm,
    promptInput,
    historyElement,
    avatarMount,
    moodLabel,
    speechBubble,
    bubbleAnswer,
    logsConsole,
    toolList,
    toolCountBadge,
    imageUploadButton,
    imageCaptureButton,
    imageUploadInput,
    attachmentRow,
    attachmentName,
    attachmentClear,
    statusSystem,
    statusState,
    statusAction,
    contractModelList,
    contractModelCount,
    statQueries,
    statRuntime,
    telemetryTotal,
    telemetryLowScore,
    telemetryFailures,
    telemetryAverages,
    telemetryRecent,
  };

  return (
    <UIStateContext.Provider value={{ refs, nodes, uiState, setUiState }}>
      {props.children}
    </UIStateContext.Provider>
  );
};

/**
 * Access UI node ref setters.
 */
export const useUIRefs = (): UIRefSetters => {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error('UI refs are not available in context.');
  }
  return context.refs;
};

/**
 * Access UI state and node accessors.
 */
export const useUIStateContext = (): UIStateContextValue => {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error('UI state context is not available.');
  }
  return context;
};
