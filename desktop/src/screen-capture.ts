import type { ImageAttachment } from '../../assistant/src/pipeline';
import { invoke } from './tauri-invoke';
import { buildDataUrl, buildImageAttachmentFromDataUrl } from './image-attachments';

type DisplayCapture = {
  id: number;
  name: string;
  width: number;
  height: number;
  data: string;
};

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const CAPTURE_COMMAND = 'capture_displays';

/**
 * Clamps a numeric value to a range.
 */
const clampValue = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

/**
 * Requests screenshots for all connected displays.
 */
const requestDisplayCaptures = async (): Promise<DisplayCapture[]> => {
  const captures = await invoke<DisplayCapture[]>(CAPTURE_COMMAND);
  if (!Array.isArray(captures)) {
    return [];
  }

  const normalized: DisplayCapture[] = [];
  for (let index = 0; index < captures.length; index += 1) {
    const entry = captures[index];
    if (!entry || typeof entry.data !== 'string' || entry.data.length === 0) {
      continue;
    }
    normalized.push(entry);
  }

  return normalized;
};

/**
 * Builds a display label for the capture list.
 */
const buildDisplayLabel = (capture: DisplayCapture, index: number): string => {
  const baseName = capture.name?.trim() || `Display ${index + 1}`;
  return `${baseName} (${capture.width}x${capture.height})`;
};

/**
 * Draws a captured image into a canvas scaled to fit its container.
 */
const drawCaptureToCanvas = (
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  container: HTMLElement,
): void => {
  const rect = container.getBoundingClientRect();
  const maxWidth = Math.max(1, Math.floor(rect.width - 24));
  const maxHeight = Math.max(1, Math.floor(rect.height - 24));
  const width = image.naturalWidth || image.width || maxWidth;
  const height = image.naturalHeight || image.height || maxHeight;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  const drawWidth = Math.max(1, Math.floor(width * scale));
  const drawHeight = Math.max(1, Math.floor(height * scale));

  canvas.width = drawWidth;
  canvas.height = drawHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, drawWidth, drawHeight);
  context.drawImage(image, 0, 0, drawWidth, drawHeight);
};

/**
 * Builds a cropped screenshot attachment from the selected rectangle.
 */
const buildCroppedAttachment = (
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  selection: SelectionRect | null,
): ImageAttachment | null => {
  const canvasWidth = canvas.width || 1;
  const canvasHeight = canvas.height || 1;
  const crop = selection ?? { x: 0, y: 0, width: canvasWidth, height: canvasHeight };

  const scaleX = (image.naturalWidth || image.width || canvasWidth) / canvasWidth;
  const scaleY = (image.naturalHeight || image.height || canvasHeight) / canvasHeight;
  const cropX = Math.round(crop.x * scaleX);
  const cropY = Math.round(crop.y * scaleY);
  const cropWidth = Math.max(1, Math.round(crop.width * scaleX));
  const cropHeight = Math.max(1, Math.round(crop.height * scaleY));

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = cropWidth;
  outputCanvas.height = cropHeight;
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) {
    return null;
  }

  outputContext.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  const dataUrl = outputCanvas.toDataURL('image/png');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `screenshot-${timestamp}.png`;
  return buildImageAttachmentFromDataUrl(dataUrl, name, 'screenshot');
};

/**
 * Opens the capture overlay and resolves with the selected image.
 */
const openCaptureOverlay = (captures: DisplayCapture[]): Promise<ImageAttachment | null> => {
  return new Promise((resolve) => {
    let activeIndex = 0;
    let activeImage: HTMLImageElement | null = null;
    let selection: SelectionRect | null = null;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    const overlay = document.createElement('div');
    overlay.className = 'capture-overlay';
    overlay.tabIndex = -1;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const panel = document.createElement('div');
    panel.className = 'capture-panel';

    const header = document.createElement('div');
    header.className = 'capture-header';

    const title = document.createElement('div');
    title.className = 'capture-title';
    title.textContent = '[ SCREEN_CAPTURE ]';

    const hint = document.createElement('div');
    hint.className = 'capture-hint';
    hint.textContent = 'Drag to select a region or click FULL to grab the entire screen.';

    header.appendChild(title);
    header.appendChild(hint);

    const body = document.createElement('div');
    body.className = 'capture-body';

    const screenList = document.createElement('div');
    screenList.className = 'capture-screen-list';

    const preview = document.createElement('div');
    preview.className = 'capture-preview';

    const previewFrame = document.createElement('div');
    previewFrame.className = 'capture-preview-frame';

    const canvas = document.createElement('canvas');
    canvas.className = 'capture-canvas';

    const selectionBox = document.createElement('div');
    selectionBox.className = 'capture-selection hidden';

    previewFrame.appendChild(canvas);
    previewFrame.appendChild(selectionBox);
    preview.appendChild(previewFrame);

    body.appendChild(screenList);
    body.appendChild(preview);

    const footer = document.createElement('div');
    footer.className = 'capture-footer';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'capture-footer-group';

    const fullButton = document.createElement('button');
    fullButton.type = 'button';
    fullButton.className = 'button capture-button';
    fullButton.textContent = 'FULL';

    leftGroup.appendChild(fullButton);

    const rightGroup = document.createElement('div');
    rightGroup.className = 'capture-footer-group';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'button capture-button';
    cancelButton.textContent = 'CANCEL';

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'button capture-button primary';
    confirmButton.textContent = 'CAPTURE';

    rightGroup.appendChild(cancelButton);
    rightGroup.appendChild(confirmButton);

    footer.appendChild(leftGroup);
    footer.appendChild(rightGroup);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    overlay.appendChild(panel);

    const screenButtons: HTMLButtonElement[] = [];

    const updateSelectionBox = (): void => {
      if (!selection) {
        selectionBox.classList.add('hidden');
        return;
      }

      selectionBox.classList.remove('hidden');
      selectionBox.style.left = `${selection.x}px`;
      selectionBox.style.top = `${selection.y}px`;
      selectionBox.style.width = `${selection.width}px`;
      selectionBox.style.height = `${selection.height}px`;
    };

    const clearSelection = (): void => {
      selection = null;
      updateSelectionBox();
    };

    const handleSelectionStart = (event: MouseEvent): void => {
      if (event.button !== 0 || !activeImage) {
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const startX = clampValue(event.clientX - rect.left, 0, rect.width);
      const startY = clampValue(event.clientY - rect.top, 0, rect.height);
      isDragging = true;
      dragStartX = startX;
      dragStartY = startY;
      selection = { x: startX, y: startY, width: 0, height: 0 };
      updateSelectionBox();
    };

    const handleSelectionMove = (event: MouseEvent): void => {
      if (!isDragging) {
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const currentX = clampValue(event.clientX - rect.left, 0, rect.width);
      const currentY = clampValue(event.clientY - rect.top, 0, rect.height);
      const left = Math.min(dragStartX, currentX);
      const top = Math.min(dragStartY, currentY);
      const width = Math.abs(currentX - dragStartX);
      const height = Math.abs(currentY - dragStartY);
      selection = { x: left, y: top, width, height };
      updateSelectionBox();
    };

    const handleSelectionEnd = (): void => {
      if (!isDragging) {
        return;
      }
      isDragging = false;
      if (!selection || selection.width < 2 || selection.height < 2) {
        clearSelection();
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup(null);
      }
    };

    const setActiveCapture = (index: number): void => {
      const capture = captures[index];
      if (!capture) {
        return;
      }

      activeIndex = index;
      for (let i = 0; i < screenButtons.length; i += 1) {
        screenButtons[i]?.classList.toggle('active', i === index);
      }

      clearSelection();
      const image = new Image();
      image.onload = () => {
        activeImage = image;
        drawCaptureToCanvas(image, canvas, preview);
      };
      image.src = buildDataUrl(capture.data);
    };

    const cleanup = (result: ImageAttachment | null): void => {
      window.removeEventListener('mousemove', handleSelectionMove);
      window.removeEventListener('mouseup', handleSelectionEnd);
      document.removeEventListener('keydown', handleKeyDown);
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      resolve(result);
    };

    for (let index = 0; index < captures.length; index += 1) {
      const capture = captures[index];
      if (!capture) {
        continue;
      }
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'button capture-screen-card';
      card.textContent = '';

      const thumb = document.createElement('img');
      thumb.className = 'capture-screen-thumb';
      thumb.src = buildDataUrl(capture.data);
      thumb.alt = buildDisplayLabel(capture, index);

      const label = document.createElement('div');
      label.className = 'capture-screen-label';
      label.textContent = buildDisplayLabel(capture, index);

      card.appendChild(thumb);
      card.appendChild(label);
      card.addEventListener('click', () => setActiveCapture(index));
      screenButtons.push(card);
      screenList.appendChild(card);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(overlay);
    overlay.focus();

    setActiveCapture(activeIndex);
    window.addEventListener('mousemove', handleSelectionMove);
    window.addEventListener('mouseup', handleSelectionEnd);
    document.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('mousedown', handleSelectionStart);

    fullButton.addEventListener('click', () => {
      selection = { x: 0, y: 0, width: canvas.width, height: canvas.height };
      updateSelectionBox();
    });

    cancelButton.addEventListener('click', () => cleanup(null));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        cleanup(null);
      }
    });

    confirmButton.addEventListener('click', () => {
      if (!activeImage) {
        return;
      }
      const attachment = buildCroppedAttachment(activeImage, canvas, selection);
      cleanup(attachment);
    });
  });
};

/**
 * Captures a user-selected region of a display.
 */
export const captureScreenSelectionAttachment = async (): Promise<ImageAttachment | null> => {
  const captures = await requestDisplayCaptures();
  if (captures.length === 0) {
    return null;
  }

  return openCaptureOverlay(captures);
};
