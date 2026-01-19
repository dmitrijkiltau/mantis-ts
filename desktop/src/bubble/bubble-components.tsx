/** @jsxImportSource solid-js */
import { createMemo, type Component } from 'solid-js';
import { renderBubbleContent } from '../bubble/render-bubble';
import { ToolOutputContent as ToolOutputContentComponent } from '../bubble/tool-output';

/**
 * Renders assistant bubble content with markdown/tool formatting.
 */
export const BubbleContent: Component<{ text: string }> = (props) => {
  const node = createMemo(() => renderBubbleContent(props.text));
  return node();
};

/**
 * Renders tool output summaries with structured previews.
 */
export const ToolOutputContent: Component<{ summary: string; raw: unknown }> = (props) => (
  <ToolOutputContentComponent summary={props.summary} raw={props.raw} />
);
