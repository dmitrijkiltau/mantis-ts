import { OllamaClient } from '../../assistant/src/models/ollama';
import { Orchestrator } from '../../assistant/src/orchestrator';
import { Runner } from '../../assistant/src/runner';
import './styles.css';

const orchestrator = new Orchestrator();
const runner = new Runner(orchestrator, new OllamaClient());

const form = document.getElementById('prompt-form') as HTMLFormElement | null;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement | null;
const statusElement = document.getElementById('status');
const historyElement = document.getElementById('history');

const setStatus = (text: string) => {
  if (statusElement) {
    statusElement.textContent = text;
  }
};

async function handleQuestion(event: Event) {
  event.preventDefault();

  if (!promptInput || !form || !historyElement) {
    return;
  }

  const question = promptInput.value.trim();
  if (!question) {
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  submitButton?.setAttribute('disabled', 'true');
  setStatus('Invoking Ollama...');

  const prompt = orchestrator.buildStrictAnswerPrompt(question);
  const settle = () => {
    submitButton?.removeAttribute('disabled');
    setStatus('Idle');
  };

  try {
    const result = await runner.executeContract(
      'STRICT_ANSWER',
      prompt,
      (raw) => orchestrator.validateStrictAnswer(raw),
    );

    const record = document.createElement('div');
    record.className = 'answer-card';
    record.innerHTML = `
      <h3>${result.ok ? 'Answer' : 'Validation failed'}</h3>
      <pre>${result.ok ? result.value : 'No valid answer after retries.'}</pre>
      <p>Attempts: ${result.attempts}</p>
    `;
    historyElement.prepend(record);
  } catch (error) {
    const errCard = document.createElement('div');
    errCard.className = 'answer-card';
    errCard.innerHTML = `<h3>Error</h3><pre>${String(error)}</pre>`;
    historyElement.prepend(errCard);
    setStatus('Error');
  } finally {
    settle();
  }
}

form?.addEventListener('submit', handleQuestion);
