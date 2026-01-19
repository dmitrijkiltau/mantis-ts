/** @jsxImportSource solid-js */
import { createMemo, type Component } from 'solid-js';
import { renderBubbleContent, renderToolOutputContent } from '../bubble-renderer';

/**
 * Renders assistant bubble content with markdown/tool formatting.
 */
export const BubbleContent: Component<{ text: string }> = (props) => {
  const html = createMemo(() => renderBubbleContent(props.text));
  return <div class="bubble-render-root" innerHTML={html()} />;
};

/**
 * Renders tool output summaries with structured previews.
 */
export const ToolOutputContent: Component<{ summary: string; raw: unknown }> = (props) => {
  const html = createMemo(() => renderToolOutputContent(props.summary, props.raw));
  return <div class="bubble-render-root" innerHTML={html()} />;
};
