/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';

/**
 * Renders the assistant speech bubble container.
 */
export const SpeechBubble: Component = () => (
  <div id="speech-bubble" class="speech-bubble hidden">
    <div class="bubble-content" id="bubble-answer"></div>
    <div class="bubble-tail"></div>
  </div>
);
