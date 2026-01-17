/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';

/**
 * Renders the prompt input form and submit control.
 */
export const InputTerminal: Component = () => (
  <div class="input-terminal">
    <form id="prompt-form">
      <div class="terminal-header">
        <span class="terminal-title">[ QUERY_INPUT ]</span>
        <span id="avatar-mood-label" class="status-indicator">IDLE</span>
      </div>
      <textarea
        id="prompt-input"
        rows={3}
        placeholder="> Enter query or drop an image..."
        class="terminal-input"
      ></textarea>
      <div id="terminal-attachment" class="terminal-attachment hidden" aria-live="polite">
        <span class="terminal-attachment-label">IMAGE</span>
        <span id="terminal-attachment-name" class="terminal-attachment-name">None</span>
        <button type="button" id="terminal-attachment-clear" class="terminal-action-button">
          <span class="button-bracket">[</span> CLEAR <span class="button-bracket">]</span>
        </button>
      </div>
      <div class="terminal-actions">
        <div class="terminal-actions-left">
          <button type="button" id="image-upload-button" class="terminal-action-button">
            <span class="button-bracket">[</span> UPLOAD <span class="button-bracket">]</span>
          </button>
          <button type="button" id="image-capture-button" class="terminal-action-button">
            <span class="button-bracket">[</span> CAPTURE <span class="button-bracket">]</span>
          </button>
          <input
            id="image-upload-input"
            type="file"
            accept="image/*"
            class="terminal-file-input"
          />
        </div>
        <button type="submit" class="terminal-button">
          <span class="button-bracket">[</span> EXECUTE <span class="button-bracket">]</span>
        </button>
      </div>
    </form>
  </div>
);
