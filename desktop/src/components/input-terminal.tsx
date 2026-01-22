/** @jsxImportSource solid-js */
import { createSignal, type Component } from 'solid-js';
import type { ImageAttachment } from '../../../assistant/src/pipeline';
import { buildImageAttachmentFromFile } from '../image-attachments';
import { captureScreenSelectionAttachment } from '../screen-capture';
import { useDesktopServices } from '../state/desktop-context';
import { useImageAttachmentStore } from '../state/image-attachment-context';
import { useUIRefs, useUIStateContext } from '../state/ui-state-context';
import { createQuestionHandler, type QuestionHandler } from '../ui-handlers';
import { open } from '@tauri-apps/plugin-dialog';

/**
 * Extracts the first image file from a FileList.
 */
const extractFirstImageFile = (files: FileList | null): File | null => {
  if (!files || files.length === 0) {
    return null;
  }

  for (let index = 0; index < files.length; index += 1) {
    const file = files.item(index);
    if (file && file.type.startsWith('image/')) {
      return file;
    }
  }

  return null;
};

/**
 * Returns true when the drag event contains file data.
 */
const isFileDrag = (event: DragEvent): boolean => {
  const types = event.dataTransfer?.types;
  if (!types) {
    return false;
  }

  for (let index = 0; index < types.length; index += 1) {
    if (types[index] === 'Files') {
      return true;
    }
  }

  return false;
};

/**
 * Renders the prompt input form and submit control.
 */
export const InputTerminal: Component = () => {
  const refs = useUIRefs();
  const services = useDesktopServices();
  const { uiState, nodes } = useUIStateContext();
  const attachmentStore = useImageAttachmentStore();
  const [isDropping, setIsDropping] = createSignal(false);
  const [workingDirectory, setWorkingDirectory] = createSignal<string | null>(null);
  let activeQuestionHandler: QuestionHandler | null = null;
  const [isExecuting, setIsExecuting] = createSignal(false);
  let dragDepth = 0;

  const attachment = () => attachmentStore.attachment();
  const attachmentLabel = () => {
    const current = attachment();
    return current ? `${current.name} (${current.source.toUpperCase()})` : 'None';
  };

  /**
   * Formats the working directory label for display.
   */
  const workingDirectoryLabel = () => workingDirectory() ?? 'Not set';

  const logUiMessage = (message: string): void => {
    uiState()?.addLog(message);
  };

  const setAttachment = (value: ImageAttachment | null): void => {
    attachmentStore.setAttachment(value);
  };

  const handleAttachment = async (
    file: File,
    source: ImageAttachment['source'],
  ): Promise<void> => {
    const attachmentResult = await buildImageAttachmentFromFile(file, source);
    if (!attachmentResult) {
      logUiMessage('Unable to read image attachment.');
      return;
    }

    setAttachment(attachmentResult);
    logUiMessage(`Image attached (${source}): ${attachmentResult.name}`);
  };

  const handleUploadClick = (): void => {
    nodes.imageUploadInput()?.click();
  };

  const handleFileChange = async (): Promise<void> => {
    const fileInput = nodes.imageUploadInput();
    const file = extractFirstImageFile(fileInput?.files ?? null);
    if (!file) {
      logUiMessage('Selected file is not an image.');
      return;
    }
    await handleAttachment(file, 'upload');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleClearAttachment = (): void => {
    setAttachment(null);
    logUiMessage('Image attachment cleared.');
  };

  const handleCaptureClick = async (): Promise<void> => {
    try {
      const attachmentResult = await captureScreenSelectionAttachment();
      if (!attachmentResult) {
        logUiMessage('Screen capture not supported or canceled.');
        return;
      }
      setAttachment(attachmentResult);
      logUiMessage(`Screenshot captured: ${attachmentResult.name}`);
    } catch (error) {
      logUiMessage(`Screenshot capture failed: ${String(error)}`);
    }
  };

  /**
   * Opens a directory picker and stores the selected working directory.
   */
  const handleWorkingDirectorySelect = async (): Promise<void> => {
    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: 'Select working directory',
      });
      if (!selection) {
        return;
      }
      const resolved = Array.isArray(selection) ? selection[0] : selection;
      if (!resolved) {
        return;
      }
      const trimmed = (typeof resolved === 'string' ? resolved : String(resolved)).trim();
      if (!trimmed) {
        return;
      }
      setWorkingDirectory(trimmed);
      services.contextStore.setWorkingDirectory(trimmed);
      logUiMessage(`Working directory set: ${trimmed}`);
    } catch (error) {
      logUiMessage(`Working directory selection failed: ${String(error)}`);
    }
  };

  /**
   * Clears the working directory selection.
   */
  const handleWorkingDirectoryClear = (): void => {
    if (!workingDirectory()) {
      return;
    }
    setWorkingDirectory(null);
    services.contextStore.setWorkingDirectory(null);
    logUiMessage('Working directory cleared.');
  };

  const handleSubmit = (event: Event): void => {
    if (isExecuting()) {
      event.preventDefault();
      return;
    }

    const state = uiState();
    const promptInput = nodes.promptInput();
    const form = nodes.promptForm();
    const historyElement = nodes.historyElement();

    if (!state || !promptInput || !form || !historyElement) {
      return;
    }

    const handler = createQuestionHandler(
      services.pipeline,
      state,
      promptInput,
      form,
      historyElement,
      attachmentStore,
      services.contextStore,
      {
        onStart: () => setIsExecuting(true),
        onFinish: () => {
          setIsExecuting(false);
          activeQuestionHandler = null;
        },
      },
    );
    activeQuestionHandler = handler;
    void handler.handle(event);
  };

  const handleDragEnter = (event: DragEvent): void => {
    if (!isFileDrag(event)) {
      return;
    }
    dragDepth += 1;
    setIsDropping(true);
  };

  const handleDragOver = (event: DragEvent): void => {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
  };

  const handleDragLeave = (): void => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      setIsDropping(false);
    }
  };

  const handleDrop = async (event: DragEvent): Promise<void> => {
    event.preventDefault();
    dragDepth = 0;
    setIsDropping(false);

    const file = extractFirstImageFile(event.dataTransfer?.files ?? null);
    if (!file) {
      logUiMessage('Dropped item is not an image.');
      return;
    }
    await handleAttachment(file, 'drop');
  };

  const handlePrimaryClick = (event: MouseEvent): void => {
    if (!isExecuting()) {
      return;
    }
    event.preventDefault();
    activeQuestionHandler?.cancel();
  };

  return (
    <div class="input-terminal" classList={{ 'is-dropping': isDropping() }}>
      <form id="prompt-form" ref={refs.promptForm} onSubmit={handleSubmit}>
        <div class="terminal-header">
          <span class="terminal-title">[ QUERY_INPUT ]</span>
          <span id="avatar-mood-label" class="status-indicator" ref={refs.moodLabel}>IDLE</span>
        </div>
        <textarea
          id="prompt-input"
          rows={3}
          placeholder="> Enter query or drop an image..."
          class="terminal-input"
          ref={refs.promptInput}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        ></textarea>
        <div class="terminal-working-dir" data-has-dir={workingDirectory() ? 'true' : 'false'}>
          <span class="terminal-working-label">WORKDIR</span>
          <span class="terminal-working-value" title={workingDirectoryLabel()}>
            {workingDirectoryLabel()}
          </span>
          <div class="terminal-working-actions">
            <button
              type="button"
              class="button terminal-action-button"
              onClick={handleWorkingDirectorySelect}
            >
              <span class="button-bracket">[</span> SET <span class="button-bracket">]</span>
            </button>
            <button
              type="button"
              class="button terminal-action-button"
              onClick={handleWorkingDirectoryClear}
              disabled={!workingDirectory()}
            >
              <span class="button-bracket">[</span> CLEAR <span class="button-bracket">]</span>
            </button>
          </div>
        </div>
        <div
          id="terminal-attachment"
          class="terminal-attachment"
          aria-live="polite"
          ref={refs.attachmentRow}
          classList={{ hidden: !attachment() }}
          data-source={attachment()?.source}
        >
          <span class="terminal-attachment-label">IMAGE</span>
          <span id="terminal-attachment-name" class="terminal-attachment-name" ref={refs.attachmentName}>
            {attachmentLabel()}
          </span>
          <button
            type="button"
            id="terminal-attachment-clear"
            class="button terminal-action-button"
            ref={refs.attachmentClear}
            onClick={handleClearAttachment}
          >
            <span class="button-bracket">[</span> CLEAR <span class="button-bracket">]</span>
          </button>
        </div>
        <div class="terminal-actions">
          <div class="terminal-actions-left">
            <button
              type="button"
              id="image-upload-button"
              class="button terminal-action-button"
              ref={refs.imageUploadButton}
              onClick={handleUploadClick}
            >
              <span class="button-bracket">[</span> UPLOAD <span class="button-bracket">]</span>
            </button>
            <button
              type="button"
              id="image-capture-button"
              class="button terminal-action-button"
              ref={refs.imageCaptureButton}
              onClick={handleCaptureClick}
            >
              <span class="button-bracket">[</span> CAPTURE <span class="button-bracket">]</span>
            </button>
            <input
              id="image-upload-input"
              type="file"
              accept="image/*"
              class="terminal-file-input"
              ref={refs.imageUploadInput}
              onChange={handleFileChange}
            />
          </div>
          <button
            type="submit"
            class="button terminal-button"
            classList={{ 'terminal-button--cancel': isExecuting() }}
            onClick={handlePrimaryClick}
          >
            <span class="button-bracket">[</span>
            {isExecuting() ? 'CANCEL' : 'EXECUTE'}
            <span class="button-bracket">]</span>
          </button>
        </div>
      </form>
    </div>
  );
};
