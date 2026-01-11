/**
 * Personality profile used to tune response tone without changing logic rules.
 */
export type PersonalityProfile = {
  id: string;
  name: string;
  description: string;
  toneInstructions: string;
};

/**
 * Registry of personality presets.
 */
export const PERSONALITY_PROFILES = {
  DEFAULT: {
    id: 'DEFAULT',
    name: 'Default',
    description: 'Neutral and helpful tone.',
    toneInstructions: 'Tone guidance: Keep a neutral, helpful, concise tone.',
  },
  CONCISE: {
    id: 'CONCISE',
    name: 'Concise',
    description: 'Very short, direct responses.',
    toneInstructions: 'Tone guidance: Be extremely concise and direct. Minimal words.',
  },
  FRIENDLY: {
    id: 'FRIENDLY',
    name : 'Friendly',
    description: 'Warm and approachable, but not verbose.',
    toneInstructions: 'Tone guidance: Be friendly and approachable, but stay concise.',
  },
  PROFESSIONAL: {
    id: 'PROFESSIONAL',
    name: 'Professional',
    description: 'Formal, clear, and calm.',
    toneInstructions: 'Tone guidance: Use a professional, formal, and calm tone. Avoid slang.',
  },
  TECHNICAL: {
    id: 'TECHNICAL',
    name: 'Technical',
    description: 'Precise and technical language.',
    toneInstructions: 'Tone guidance: Use precise technical language. Avoid metaphors and casual phrasing.',
  },
  CALM_ERROR: {
    id: 'CALM_ERROR',
    name: 'Calm Error',
    description: 'Calm and reassuring error tone.',
    toneInstructions: 'Tone guidance: Be calm and reassuring. Avoid blame or urgency.',
  },
  PLAYFUL: {
    id: 'PLAYFUL',
    name: 'Playful',
    description: 'Light, playful tone without roleplay.',
    toneInstructions: 'Tone guidance: Be light and playful, but avoid roleplay or characters.',
  },
  ROLEPLAY: {
    id: 'ROLEPLAY',
    name: 'Roleplay',
    description: 'Engaging and character-driven tone.',
    toneInstructions: 'Tone guidance: Use an engaging, character-driven tone. Embrace creativity and imagination.',
  },
  EXPLICIT: {
    id: 'EXPLICIT',
    name: 'Explicit',
    description: 'Direct and unfiltered tone.',
    toneInstructions: 'Tone guidance: Be direct and unfiltered. Use strong language if appropriate.',
  },
} as const;

export type PersonalityKey = keyof typeof PERSONALITY_PROFILES;

/**
 * Returns the default personality profile.
 */
export const getDefaultPersonalityProfile = (): PersonalityProfile => {
  return PERSONALITY_PROFILES.DEFAULT;
};

/**
 * Returns a personality profile by key, falling back to DEFAULT.
 */
export const getPersonalityProfile = (key?: string): PersonalityProfile => {
  if (!key) {
    return getDefaultPersonalityProfile();
  }

  if (key in PERSONALITY_PROFILES) {
    return PERSONALITY_PROFILES[key as PersonalityKey];
  }

  return getDefaultPersonalityProfile();
};

/**
 * Returns the list of personality keys for contract constraints.
 */
export const getPersonalityKeys = (): PersonalityKey[] => {
  const keys = Object.keys(PERSONALITY_PROFILES) as PersonalityKey[];
  const results: PersonalityKey[] = [];

  for (let index = 0; index < keys.length; index += 1) {
    results.push(keys[index]);
  }

  return results;
};
