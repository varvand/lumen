import { library } from './library.svelte';
import { parseQuestions, questionPrompt } from './questions';
import { PROVIDER_NAMES, tutor, type Provider } from './tutor';
import { ui } from './ui.svelte';

type Status = { writing: true; provider: Provider } | { writing: false; error: string };

/** Writes practice questions for notes with the user's chat app or Ollama model. */
class QuestionWriter {
  status = $state<Record<string, Status>>({});

  /** Add generated questions to a note; the note may change or close while the model works. */
  async write(noteId: string) {
    if (this.status[noteId]?.writing) return;
    const fail = (error: string) => (this.status[noteId] = { writing: false, error });
    let providers: Provider[];
    try {
      providers = await tutor.providers();
    } catch (e) {
      return fail(String(e));
    }
    const provider = tutor.preferred(providers);
    if (!provider)
      return fail('Connect Claude Code, Codex or Ollama in Settings to write questions for you.');
    const note = library.get(noteId);
    if (!note) return;
    this.status[noteId] = { writing: true, provider };
    try {
      const intent = note.intent === 'reference' ? 'remember' : note.intent;
      // Inventing problems with correct answers is worth reasoning; recall questions are not.
      const effort = intent === 'apply' ? 'deep' : 'standard';
      const reply = await tutor.ask(provider, questionPrompt(note, intent), effort);
      const prompts = parseQuestions(reply, intent);
      const current = library.get(noteId);
      if (!current) return;
      library.change(noteId, { prompts: [...current.prompts, ...prompts] });
      delete this.status[noteId];
      ui.notify(
        `${PROVIDER_NAMES[provider]} wrote ${prompts.length} practice question${prompts.length === 1 ? '' : 's'}`,
      );
    } catch (e) {
      fail(String(e).replace(/^Error: /, ''));
    }
  }
  dismiss(noteId: string) {
    delete this.status[noteId];
  }
}

export const questionWriter = new QuestionWriter();
