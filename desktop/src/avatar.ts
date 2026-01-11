import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AvatarGraphic from './assets/avatar.svg?react';

export type AvatarMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'concerned';

type MoodStyle = {
  accent: string;
  accent2: string;
  mouth: string;
  faceHighlight: number;
};

const moodStyles: Record<AvatarMood, MoodStyle> = {
  idle: {
    accent: '#7c5cff',
    accent2: '#22d3ee',
    mouth: 'M 48 73 C 54 78 66 78 72 73',
    faceHighlight: 0.35,
  },
  listening: {
    accent: '#22d3ee',
    accent2: '#7c5cff',
    mouth: 'M 47 72 C 54 79 66 79 73 72',
    faceHighlight: 0.42,
  },
  thinking: {
    accent: '#f59e0b',
    accent2: '#22d3ee',
    mouth: 'M 48 74 C 56 74 64 74 72 74',
    faceHighlight: 0.3,
  },
  speaking: {
    accent: '#10b981',
    accent2: '#22d3ee',
    mouth: 'M 48 72 C 54 80 66 80 72 72',
    faceHighlight: 0.46,
  },
  concerned: {
    accent: '#f97316',
    accent2: '#7c5cff',
    mouth: 'M 48 76 C 54 70 66 70 72 76',
    faceHighlight: 0.25,
  },
};

/**
 * Controls the assistant avatar SVG, enabling mood changes and gaze tracking.
 */
export class AssistantAvatar {
  private readonly container: HTMLElement;

  private readonly svg: SVGSVGElement;

  private readonly pupils: SVGCircleElement[];

  private readonly mouth: SVGPathElement | null;

  private readonly faceHighlight: SVGCircleElement | null;

  private bounds: DOMRect | null = null;

  private currentMood: AvatarMood | null = null;

  private readonly pointerHandler: (event: PointerEvent) => void;

  private readonly leaveHandler: () => void;

  private readonly resizeHandler: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    const svgMarkup = renderToStaticMarkup(
      React.createElement(AvatarGraphic, { className: 'assistant-avatar-svg', focusable: false }),
    );
    this.container.innerHTML = svgMarkup;

    const svg = this.container.querySelector('svg');
    if (!svg) {
      throw new Error('Avatar SVG could not be initialized.');
    }
    this.svg = svg;
    this.svg.style.overflow = 'visible';

    const pupilNodes = this.svg.querySelectorAll<SVGCircleElement>('[data-pupil]');
    const pupils: SVGCircleElement[] = [];
    for (let index = 0; index < pupilNodes.length; index += 1) {
      pupils.push(pupilNodes[index]);
    }
    this.pupils = pupils;
    this.mouth = this.svg.querySelector<SVGPathElement>('[data-mouth]');
    this.faceHighlight = this.svg.querySelector<SVGCircleElement>('[data-face-highlight]');

    this.pointerHandler = (event: PointerEvent) => {
      this.handlePointer(event);
    };
    this.leaveHandler = () => {
      this.resetGaze();
    };
    this.resizeHandler = () => {
      this.refreshBounds();
    };

    this.bindEvents();
    this.setMood('idle');
  }

  /**
   * Updates the avatar appearance according to the provided mood.
   */
  setMood(nextMood: AvatarMood): void {
    if (this.currentMood === nextMood) {
      return;
    }

    const style = moodStyles[nextMood];
    this.currentMood = nextMood;
    this.container.setAttribute('data-mood', nextMood);
    this.svg.style.setProperty('--accent', style.accent);
    this.svg.style.setProperty('--accent2', style.accent2);

    if (this.mouth) {
      this.mouth.setAttribute('d', style.mouth);
    }

    if (this.faceHighlight) {
      this.faceHighlight.setAttribute('opacity', style.faceHighlight.toString());
    }
  }

  /**
   * Stops animations and listeners, useful when disposing the UI.
   */
  destroy(): void {
    window.removeEventListener('pointermove', this.pointerHandler);
    this.container.removeEventListener('pointerleave', this.leaveHandler);
    window.removeEventListener('resize', this.resizeHandler);
  }

  /**
   * Attaches listeners for pointer tracking and layout changes.
   */
  private bindEvents(): void {
    this.refreshBounds();
    window.addEventListener('pointermove', this.pointerHandler, { passive: true });
    this.container.addEventListener('pointerleave', this.leaveHandler);
    window.addEventListener('resize', this.resizeHandler);
  }

  /**
   * Nudges pupils and head tilt toward the user's pointer position.
   */
  private handlePointer(event: PointerEvent): void {
    if (!this.bounds) {
      this.refreshBounds();
    }
    if (!this.bounds) {
      return;
    }

    const centerX = this.bounds.left + this.bounds.width / 2;
    const centerY = this.bounds.top + this.bounds.height / 2;
    const relativeX = (event.clientX - centerX) / (this.bounds.width / 2);
    const relativeY = (event.clientY - centerY) / (this.bounds.height / 2);
    const clampedX = Math.max(-1, Math.min(1, relativeX));
    const clampedY = Math.max(-1, Math.min(1, relativeY));
    const maxOffset = 3.2;
    const x = Number((clampedX * maxOffset).toFixed(2));
    const y = Number((clampedY * maxOffset).toFixed(2));

    for (let index = 0; index < this.pupils.length; index += 1) {
      this.pupils[index].style.transform = `translate(${x}px, ${y}px)`;
    }

    this.svg.style.transform = `translate(${x * 0.12}px, ${y * 0.12}px)`;
  }

  /**
   * Returns the avatar gaze to neutral when the cursor exits the frame.
   */
  private resetGaze(): void {
    for (let index = 0; index < this.pupils.length; index += 1) {
      this.pupils[index].style.transform = 'translate(0px, 0px)';
    }
    this.svg.style.transform = 'translate(0px, 0px)';
  }

  /**
   * Recomputes the element bounds for pointer tracking math.
   */
  private refreshBounds(): void {
    this.bounds = this.container.getBoundingClientRect();
  }
}
