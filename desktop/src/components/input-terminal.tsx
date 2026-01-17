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
        placeholder="> Enter query..."
        class="terminal-input"
      ></textarea>
      <button type="submit" class="terminal-button">
        <span class="button-bracket">[</span> EXECUTE <span class="button-bracket">]</span>
      </button>
    </form>
  </div>
);
