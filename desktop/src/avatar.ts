import AvatarGraphic from './assets/avatar.svg?raw';

export type AvatarMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'concerned';

type MouthShape = {
  upper: string;
  lower: string;
  openness: number;
};

type MoodStyle = {
  accent: string;
  accent2: string;
  mouth: MouthShape;
  faceHighlight: number;
  browLeftY: number;
  browRightY: number;
  browLeftRotate: number;
  browRightRotate: number;
  eyeScale: number;
  eyeShiftY: number;
  pupilScale: number;
  eyeScaleY?: number;
  pupilScaleY?: number;
  gazeLocked?: { x: number; y: number };
};

type EmoteStyle = {
  durationMs: number;
  mouth?: MouthShape;
  faceHighlight?: number;
  browLeftYOffset?: number;
  browRightYOffset?: number;
  browLeftRotateOffset?: number;
  browRightRotateOffset?: number;
  eyeScaleBoost?: number;
  eyeScaleYBoost?: number;
  eyeShiftYOffset?: number;
  pupilScaleBoost?: number;
  pupilScaleYBoost?: number;
  gazeX?: number;
  gazeY?: number;
};

const AVATAR_CLASS_NAME = 'assistant-avatar-svg';

/**
 * Ensures the root SVG has the avatar class applied.
 */
const ensureSvgClass = (openTag: string, className: string): string => {
  if (openTag.includes('class=')) {
    return openTag.replace(/class="([^"]*)"/, (_, existing) => {
      const merged = `${String(existing)} ${className}`.trim();
      return `class="${merged}"`;
    });
  }

  return openTag.replace('<svg', `<svg class="${className}"`);
};

/**
 * Injects a missing attribute on the root SVG tag.
 */
const ensureSvgAttribute = (openTag: string, name: string, value: string): string => {
  const attributePattern = new RegExp(`\\b${name}=`, 'i');
  if (attributePattern.test(openTag)) {
    return openTag;
  }

  return openTag.replace('<svg', `<svg ${name}="${value}"`);
};

/**
 * Applies required avatar attributes to the SVG markup.
 */
const applyAvatarMarkupAttributes = (svg: string): string => {
  const match = svg.match(/<svg\b[^>]*>/i);
  if (!match) {
    return svg;
  }

  let openTag = match[0];
  openTag = ensureSvgClass(openTag, AVATAR_CLASS_NAME);
  openTag = ensureSvgAttribute(openTag, 'focusable', 'false');

  return svg.replace(match[0], openTag);
};

const moodStyles: Record<AvatarMood, MoodStyle> = {
  idle: {
    accent: '#00ff88',
    accent2: '#22d3ee',
    mouth: {
      upper: 'M60 90 Q70 92 80 92 Q90 92 100 90',
      lower: 'M60 90 Q70 92 80 92 Q90 92 100 90',
      openness: 0,
    },
    faceHighlight: 0.25,
    browLeftY: 0,
    browRightY: 0,
    browLeftRotate: 0,
    browRightRotate: 0,
    eyeScale: 1,
    eyeShiftY: 0,
    pupilScale: 1,
  },
  listening: {
    accent: '#22d3ee',
    accent2: '#00ff88',
    mouth: {
      upper: 'M60 89 Q70 85 80 86 Q90 85 100 89',
      lower: 'M60 91 Q70 95 80 94 Q90 95 100 91',
      openness: 2,
    },
    faceHighlight: 0.3,
    browLeftY: -2,
    browRightY: -2,
    browLeftRotate: -6,
    browRightRotate: 6,
    eyeScale: 1.12,
    eyeShiftY: 0,
    pupilScale: 1.12,
  },
  thinking: {
    accent: '#f59e0b',
    accent2: '#00ff88',
    mouth: {
      upper: 'M62 90 Q70 89 80 89 Q90 89 98 90',
      lower: 'M62 90 Q70 91 80 91 Q90 91 98 90',
      openness: 0,
    },
    faceHighlight: 0.2,
    browLeftY: -1,
    browRightY: 1,
    browLeftRotate: -2,
    browRightRotate: 8,
    eyeScale: 0.9,
    eyeShiftY: -1.5,
    pupilScale: 0.95,
    gazeLocked: { x: 1.2, y: -2.4 },
  },
  speaking: {
    accent: '#00ff88',
    accent2: '#10b981',
    mouth: {
      upper: 'M60 88 Q70 84 80 85 Q90 84 100 88',
      lower: 'M60 94 Q70 100 80 99 Q90 100 100 94',
      openness: 6,
    },
    faceHighlight: 0.35,
    browLeftY: -0.5,
    browRightY: -0.5,
    browLeftRotate: -3,
    browRightRotate: 3,
    eyeScale: 1.05,
    eyeShiftY: 0,
    pupilScale: 1,
  },
  concerned: {
    accent: '#f97316',
    accent2: '#00ff88',
    mouth: {
      upper: 'M62 92 Q70 90 80 90 Q90 90 98 92',
      lower: 'M62 92 Q70 95 80 94 Q90 95 98 92',
      openness: 1,
    },
    faceHighlight: 0.18,
    browLeftY: 1.5,
    browRightY: 1.5,
    browLeftRotate: 10,
    browRightRotate: -10,
    eyeScale: 0.85,
    eyeShiftY: 1,
    pupilScale: 0.9,
  },
};

const stateEmotes: Partial<Record<AvatarMood, EmoteStyle>> = {
  listening: {
    durationMs: 520,
    eyeScaleBoost: 0.08,
    eyeScaleYBoost: 0.14,
    pupilScaleBoost: 0.08,
    browLeftYOffset: -1.2,
    browRightYOffset: -1.2,
    browLeftRotateOffset: -4,
    browRightRotateOffset: 4,
  },
  thinking: {
    durationMs: 560,
    eyeScaleBoost: -0.06,
    eyeScaleYBoost: -0.1,
    pupilScaleBoost: -0.05,
    browLeftYOffset: -0.4,
    browRightYOffset: 1.1,
    browRightRotateOffset: 6,
    gazeX: -0.8,
  },
  speaking: {
    durationMs: 520,
    eyeScaleBoost: 0.04,
    eyeScaleYBoost: 0.08,
    pupilScaleBoost: 0.05,
    browLeftYOffset: -0.6,
    browRightYOffset: -0.6,
  },
  concerned: {
    durationMs: 620,
    eyeScaleBoost: -0.08,
    eyeScaleYBoost: -0.14,
    pupilScaleBoost: -0.06,
    browLeftYOffset: 1.6,
    browRightYOffset: 1.6,
    browLeftRotateOffset: 6,
    browRightRotateOffset: -6,
    eyeShiftYOffset: 0.4,
  },
};

const idleEmotes: EmoteStyle[] = [
  {
    durationMs: 420,
    eyeScaleBoost: -0.08,
    eyeScaleYBoost: -0.14,
    pupilScaleBoost: -0.08,
  },
  {
    durationMs: 520,
    eyeScaleBoost: 0.06,
    eyeScaleYBoost: 0.12,
    pupilScaleBoost: 0.05,
    browLeftYOffset: -0.8,
    browRightYOffset: -0.8,
  },
];

const clickEmotes: EmoteStyle[] = [
  {
    durationMs: 360,
    eyeScaleBoost: 0.1,
    eyeScaleYBoost: 0.18,
    pupilScaleBoost: 0.12,
    browLeftYOffset: -1,
    browRightYOffset: -1,
  },
  {
    durationMs: 320,
    eyeScaleBoost: -0.12,
    eyeScaleYBoost: -0.18,
    pupilScaleBoost: -0.1,
  },
];

const IDLE_CHECK_INTERVAL_MS = 1400;
const IDLE_POINTER_GRACE_MS = 1800;
const IDLE_GAZE_MIN_MS = 520;
const IDLE_GAZE_MAX_MS = 920;
const IDLE_EMOTE_COOLDOWN_MS = 12000;

/**
 * Controls the assistant avatar SVG, enabling mood changes and gaze tracking.
 */
export class AssistantAvatar {
  private readonly container: HTMLElement;

  private readonly svg: SVGSVGElement;

  private readonly mouthUpper: SVGPathElement | null;

  private readonly mouthLower: SVGPathElement | null;

  private readonly mouthInterior: SVGEllipseElement | null;

  private readonly faceHighlight: SVGCircleElement | null;

  private bounds: DOMRect | null = null;

  private currentMood: AvatarMood | null = null;

  private currentStyle: MoodStyle | null = null;

  private readonly pointerHandler: (event: PointerEvent) => void;

  private readonly pointerDownHandler: (event: PointerEvent) => void;

  private readonly leaveHandler: () => void;

  private readonly resizeHandler: () => void;

  private idleTimer: number | null = null;

  private idleGazeTimer: number | null = null;

  private emoteTimer: number | null = null;

  private emoteLockUntil = 0;

  private idleEmoteCooldownUntil = 0;

  private lastPointerAt = Date.now();

  constructor(container: HTMLElement) {
    this.container = container;
    const svgMarkup = applyAvatarMarkupAttributes(AvatarGraphic);
    this.container.innerHTML = svgMarkup;

    const svg = this.container.querySelector('svg');
    if (!svg) {
      throw new Error('Avatar SVG could not be initialized.');
    }
    this.svg = svg;
    this.svg.style.overflow = 'visible';

    this.mouthUpper = this.svg.querySelector<SVGPathElement>('[data-mouth-upper]');
    this.mouthLower = this.svg.querySelector<SVGPathElement>('[data-mouth-lower]');
    this.mouthInterior = this.svg.querySelector<SVGEllipseElement>('[data-mouth-interior]');
    this.faceHighlight = this.svg.querySelector<SVGCircleElement>('[data-face-highlight]');

    this.pointerHandler = (event: PointerEvent) => {
      this.handlePointer(event);
    };
    this.pointerDownHandler = (event: PointerEvent) => {
      this.handlePointerDown(event);
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
    this.currentStyle = style;
    this.container.setAttribute('data-mood', nextMood);
    this.clearEmote();
    this.applyStyle(style);
    this.triggerStateEmote(nextMood);
  }

  /**
   * Stops animations and listeners, useful when disposing the UI.
   */
  destroy(): void {
    window.removeEventListener('pointermove', this.pointerHandler);
    this.container.removeEventListener('pointerdown', this.pointerDownHandler);
    this.container.removeEventListener('pointerleave', this.leaveHandler);
    window.removeEventListener('resize', this.resizeHandler);
    if (this.idleTimer !== null) {
      window.clearInterval(this.idleTimer);
    }
    if (this.idleGazeTimer !== null) {
      window.clearTimeout(this.idleGazeTimer);
    }
    if (this.emoteTimer !== null) {
      window.clearTimeout(this.emoteTimer);
    }
  }

  /**
   * Attaches listeners for pointer tracking and layout changes.
   */
  private bindEvents(): void {
    this.refreshBounds();
    window.addEventListener('pointermove', this.pointerHandler, { passive: true });
    this.container.addEventListener('pointerdown', this.pointerDownHandler);
    this.container.addEventListener('pointerleave', this.leaveHandler);
    window.addEventListener('resize', this.resizeHandler);
    this.startIdleLoop();
  }

  /**
   * Returns true when gaze tracking should be locked to a fixed position.
   */
  private isGazeLocked(): boolean {
    return this.currentStyle?.gazeLocked !== undefined;
  }

  /**
   * Nudges pupils and head tilt toward the user's pointer position.
   */
  private handlePointer(event: PointerEvent): void {
    this.lastPointerAt = Date.now();
    if (this.isEmoteActive() || this.isGazeLocked()) {
      return;
    }

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
    const maxOffsetX = 3.4;
    const maxOffsetY = 1.8;
    const x = Number((clampedX * maxOffsetX).toFixed(2));
    const y = Number((clampedY * maxOffsetY).toFixed(2));

    this.clearIdleGaze();
    this.applyGaze(x, y);
  }

  /**
   * Adds a small reaction when the avatar is clicked.
   */
  private handlePointerDown(_event: PointerEvent): void {
    this.lastPointerAt = Date.now();
    if (this.isEmoteActive()) {
      return;
    }

    if (Math.random() < 0.35) {
      this.triggerRandomEmote(clickEmotes);
    }
  }

  /**
   * Returns the avatar gaze to neutral when the cursor exits the frame.
   */
  private resetGaze(): void {
    if (this.isEmoteActive() || this.isGazeLocked()) {
      return;
    }

    this.container.style.setProperty('--pupil-x', '0px');
    this.container.style.setProperty('--pupil-y', '0px');
    this.svg.style.transform = 'translate(0px, 0px)';
  }

  /**
   * Recomputes the element bounds for pointer tracking math.
   */
  private refreshBounds(): void {
    this.bounds = this.container.getBoundingClientRect();
  }

  /**
   * Applies gaze offsets for pupils and subtle head tilt.
   */
  private applyGaze(x: number, y: number): void {
    this.container.style.setProperty('--pupil-x', `${x}px`);
    this.container.style.setProperty('--pupil-y', `${y}px`);
    this.svg.style.transform = `translate(${x * 0.12}px, ${y * 0.12}px)`;
  }

  /**
   * Applies accent colors to all colorable SVG elements.
   */
  private applyAccentColors(accent: string, accent2: string): void {
    this.svg.style.setProperty('--pip', accent);
    this.svg.style.setProperty('--pip-soft', `${accent}26`);
    this.svg.style.setProperty('--pip-dim', `${accent}14`);
    this.svg.style.setProperty('--accent', accent);
    this.svg.style.setProperty('--accent2', accent2);
    this.container.style.setProperty('filter', `drop-shadow(0 0 30px ${accent}80)`);
  }

  /**
   * Applies the mouth shape to the SVG elements.
   */
  private applyMouth(mouth: MouthShape): void {
    if (this.mouthUpper) {
      this.mouthUpper.setAttribute('d', mouth.upper);
    }
    if (this.mouthLower) {
      this.mouthLower.setAttribute('d', mouth.lower);
    }
    if (this.mouthInterior) {
      this.mouthInterior.setAttribute('ry', mouth.openness.toString());
    }
  }

  /**
   * Applies the baseline style for a mood.
   */
  private applyStyle(style: MoodStyle): void {
    this.applyAccentColors(style.accent, style.accent2);
    this.container.style.setProperty('--brow-left-y', `${style.browLeftY}px`);
    this.container.style.setProperty('--brow-right-y', `${style.browRightY}px`);
    this.container.style.setProperty('--brow-left-rotate', `${style.browLeftRotate}deg`);
    this.container.style.setProperty('--brow-right-rotate', `${style.browRightRotate}deg`);
    this.container.style.setProperty('--eye-scale', style.eyeScale.toString());
    this.container.style.setProperty('--eye-shift-y', `${style.eyeShiftY}px`);
    this.container.style.setProperty('--pupil-scale', style.pupilScale.toString());
    this.container.style.removeProperty('--eye-scale-y');
    this.container.style.removeProperty('--pupil-scale-y');

    this.applyMouth(style.mouth);

    if (this.faceHighlight) {
      this.faceHighlight.setAttribute('opacity', style.faceHighlight.toString());
    }

    if (style.gazeLocked) {
      this.applyGaze(style.gazeLocked.x, style.gazeLocked.y);
    } else {
      this.resetGaze();
    }
  }

  /**
   * Starts background idling for gaze micro-movements and idle emotes.
   */
  private startIdleLoop(): void {
    if (this.idleTimer !== null) {
      return;
    }

    this.idleTimer = window.setInterval(() => {
      this.tickIdle();
    }, IDLE_CHECK_INTERVAL_MS);
  }

  /**
   * Performs idle behavior when the avatar is not engaged.
   */
  private tickIdle(): void {
    if (this.currentMood !== 'idle') {
      return;
    }
    if (this.isEmoteActive() || this.isGazeLocked()) {
      return;
    }

    const now = Date.now();
    if (now - this.lastPointerAt < IDLE_POINTER_GRACE_MS) {
      return;
    }

    if (!this.idleGazeTimer && Math.random() < 0.55) {
      this.nudgeIdleGaze();
    }

    if (now >= this.idleEmoteCooldownUntil && Math.random() < 0.2) {
      this.idleEmoteCooldownUntil = now + IDLE_EMOTE_COOLDOWN_MS;
      this.triggerRandomEmote(idleEmotes);
    }
  }

  /**
   * Animates a short idle gaze nudge.
   */
  private nudgeIdleGaze(): void {
    const x = Number((Math.random() * 3 - 1.5).toFixed(2));
    const y = Number((Math.random() * 1.6 - 0.8).toFixed(2));
    this.applyGaze(x, y);

    const duration = IDLE_GAZE_MIN_MS
      + Math.floor(Math.random() * (IDLE_GAZE_MAX_MS - IDLE_GAZE_MIN_MS));
    this.idleGazeTimer = window.setTimeout(() => {
      this.idleGazeTimer = null;
      this.resetGaze();
    }, duration);
  }

  /**
   * Clears any active idle gaze timers.
   */
  private clearIdleGaze(): void {
    if (this.idleGazeTimer !== null) {
      window.clearTimeout(this.idleGazeTimer);
      this.idleGazeTimer = null;
    }
  }

  /**
   * Triggers a short emote when the avatar enters a new state.
   */
  private triggerStateEmote(mood: AvatarMood): void {
    const emote = stateEmotes[mood];
    if (emote) {
      this.triggerEmote(emote);
    }
  }

  /**
   * Picks a random emote from a list.
   */
  private triggerRandomEmote(emotes: EmoteStyle[]): void {
    if (emotes.length === 0) {
      return;
    }
    const index = Math.floor(Math.random() * emotes.length);
    const emote = emotes[index];
    if (emote) {
      this.triggerEmote(emote);
    }
  }

  /**
   * Applies a temporary emote style and suppresses pointer tracking.
   */
  private triggerEmote(emote: EmoteStyle): void {
    const base = this.currentStyle ?? moodStyles.idle;
    this.clearEmote();
    this.clearIdleGaze();
    this.emoteLockUntil = Date.now() + emote.durationMs;

    const browLeftY = base.browLeftY + (emote.browLeftYOffset ?? 0);
    const browRightY = base.browRightY + (emote.browRightYOffset ?? 0);
    const browLeftRotate = base.browLeftRotate + (emote.browLeftRotateOffset ?? 0);
    const browRightRotate = base.browRightRotate + (emote.browRightRotateOffset ?? 0);
    const eyeScale = base.eyeScale + (emote.eyeScaleBoost ?? 0);
    const eyeScaleY = base.eyeScale + (emote.eyeScaleYBoost ?? emote.eyeScaleBoost ?? 0);
    const eyeShiftY = base.eyeShiftY + (emote.eyeShiftYOffset ?? 0);
    const pupilScale = base.pupilScale + (emote.pupilScaleBoost ?? 0);
    const pupilScaleY = base.pupilScale + (emote.pupilScaleYBoost ?? emote.pupilScaleBoost ?? 0);

    this.container.style.setProperty('--brow-left-y', `${browLeftY}px`);
    this.container.style.setProperty('--brow-right-y', `${browRightY}px`);
    this.container.style.setProperty('--brow-left-rotate', `${browLeftRotate}deg`);
    this.container.style.setProperty('--brow-right-rotate', `${browRightRotate}deg`);
    this.container.style.setProperty('--eye-scale', eyeScale.toString());
    this.container.style.setProperty('--eye-scale-y', eyeScaleY.toString());
    this.container.style.setProperty('--eye-shift-y', `${eyeShiftY}px`);
    this.container.style.setProperty('--pupil-scale', pupilScale.toString());
    this.container.style.setProperty('--pupil-scale-y', pupilScaleY.toString());

    this.applyMouth(emote.mouth ?? base.mouth);

    if (this.faceHighlight) {
      const highlight = emote.faceHighlight ?? base.faceHighlight;
      this.faceHighlight.setAttribute('opacity', highlight.toString());
    }

    const gazeX = emote.gazeX ?? 0;
    const gazeY = emote.gazeY ?? 0;
    this.applyGaze(gazeX, gazeY);

    this.emoteTimer = window.setTimeout(() => {
      this.emoteTimer = null;
      this.emoteLockUntil = 0;
      this.restoreMoodStyle();
    }, emote.durationMs);
  }

  /**
   * Restores the visuals to the active mood.
   */
  private restoreMoodStyle(): void {
    const mood = this.currentMood ?? 'idle';
    const style = moodStyles[mood];
    this.currentStyle = style;
    this.applyStyle(style);
    this.resetGaze();
  }

  /**
   * Cancels any active emote and resets visuals.
   */
  private clearEmote(): void {
    if (this.emoteTimer !== null) {
      window.clearTimeout(this.emoteTimer);
      this.emoteTimer = null;
    }
    this.emoteLockUntil = 0;
  }

  /**
   * Returns true when pointer tracking should be ignored.
   */
  private isEmoteActive(): boolean {
    return Date.now() < this.emoteLockUntil;
  }
}
