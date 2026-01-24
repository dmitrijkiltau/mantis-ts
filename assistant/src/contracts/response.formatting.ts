// DEPRECATED: Use `CONTRACT_ANSWER` with mode `'tool-formatting'` and `getAnswerValidator('tool-formatting')`.

export { CONTRACT_ANSWER as CONTRACT_RESPONSE_FORMATTING } from './answer.js';

import { getAnswerValidator } from './answer.js';
export const validateResponseFormatting = getAnswerValidator('tool-formatting');

