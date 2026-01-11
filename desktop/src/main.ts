import { OllamaClient } from '../../assistant/src/models/ollama';
import { Orchestrator } from '../../assistant/src/orchestrator';
import { Pipeline } from '../../assistant/src/pipeline';
import { Runner } from '../../assistant/src/runner';
import './styles.css';

const orchestrator = new Orchestrator();
const runner = new Runner(orchestrator, new OllamaClient());
const pipeline = new Pipeline(orchestrator, runner);

const form = document.getElementById('prompt-form') as HTMLFormElement | null;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement | null;
const statusElement = document.getElementById('status');
const historyElement = document.getElementById('history');

const setStatus = (text: string) => {
  if (statusElement) {
    statusElement.textContent = text;
  }
};

const formatPayload = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
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
  const settle = () => {
    submitButton?.removeAttribute('disabled');
    setStatus('Idle');
  };

  try {
    const result = await pipeline.run(question);

    const record = document.createElement('div');
    record.className = 'answer-card';
    if (result.ok) {
      if (result.kind === 'tool') {
        record.innerHTML = `
          <h3>Tool: ${result.tool}</h3>
          <pre>${formatPayload(result.result)}</pre>
          <p>Args: ${formatPayload(result.args)}</p>
          <p>Attempts: ${result.attempts}</p>
        `;
      } else {
        record.innerHTML = `
          <h3>Answer</h3>
          <pre>${result.value}</pre>
          <p>Attempts: ${result.attempts}</p>
        `;
      }
    } else {
      const errorDetail = result.error
        ? `${result.error.code}: ${result.error.message}`
        : 'No valid response after retries.';
      record.innerHTML = `
        <h3>Error (${result.stage})</h3>
        <pre>${errorDetail}</pre>
        <p>Attempts: ${result.attempts}</p>
      `;
    }
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
