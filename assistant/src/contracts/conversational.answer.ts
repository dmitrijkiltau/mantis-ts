// DEPRECATED: Use `CONTRACT_ANSWER` with mode `'conversational'` and `getAnswerValidator('conversational')`.

export { CONTRACT_ANSWER as CONTRACT_CONVERSATIONAL_ANSWER } from './answer.js';

import { getAnswerValidator } from './answer.js';
export const validateConversationalAnswer = getAnswerValidator('conversational');

