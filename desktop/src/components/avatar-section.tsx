/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { InputTerminal } from './input-terminal';
import { SpeechBubble } from './speech-bubble';

/**
 * Renders the avatar canvas, prompt terminal, and bubble output.
 */
export const AvatarSection: Component = () => (
  <section id="avatar-input-output">
    <div id="assistant-avatar" class="avatar-canvas" aria-live="polite"></div>
    <InputTerminal />
    <SpeechBubble />
  </section>
);
