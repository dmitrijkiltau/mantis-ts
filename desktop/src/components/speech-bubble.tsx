/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { useUIRefs } from '../state/ui-state-context';
import { handleRichContentInteraction } from '../ui-handlers';

/**
 * Renders the assistant speech bubble container.
 */
export const SpeechBubble: Component = () => {
  const refs = useUIRefs();

  return (
    <div id="speech-bubble" class="speech-bubble hidden" ref={refs.speechBubble}>
      <div
        class="bubble-content"
        id="bubble-answer"
        ref={refs.bubbleAnswer}
        onClick={handleRichContentInteraction}
      ></div>
      <div class="bubble-tail"></div>
    </div>
  );
};
