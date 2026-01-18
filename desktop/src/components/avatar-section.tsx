/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { InputTerminal } from './input-terminal';
import { SpeechBubble } from './speech-bubble';
import { useUIRefs } from '../state/ui-state-context';

/**
 * Renders the avatar canvas, prompt terminal, and bubble output.
 */
export const AvatarSection: Component = () => {
  const refs = useUIRefs();

  return (
    <section id="avatar-input-output">
      <div id="assistant-avatar" class="avatar-canvas" aria-live="polite" ref={refs.avatarMount}></div>
      <InputTerminal />
      <SpeechBubble />
    </section>
  );
};
