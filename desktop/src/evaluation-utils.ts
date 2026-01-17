import type { EvaluationAlert } from '../../assistant/src/pipeline';

export const formatEvaluationSummary = (evaluation: Record<string, number>): string => {
  const parts = Object.entries(evaluation)
    .map(([key, value]) => `${key}: ${value}/10`);
  return parts.join(', ');
};

export const getEvaluationAlertMessage = (alert: EvaluationAlert): string => {
  if (alert === 'low_scores') {
    return 'Evaluation warning: one or more scores are below 4/10.';
  }
  return 'Scoring evaluation failed to produce numeric scores.';
};
