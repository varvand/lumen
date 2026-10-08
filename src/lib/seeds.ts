import type { Note } from './types';

export function seedNotes(): Note[] {
  const now = Date.now();
  const base = {
    intent: 'reference' as const,
    pinned: false,
    inbox: false,
    trashed: false,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    source: '',
    tags: [],
    prompts: [],
  };
  return [
    {
      ...base,
      id: 'welcome-to-lumen',
      title: 'A little clearer, every day.',
      collection: 'Getting started',
      pinned: true,
      tags: ['welcome'],
      body: `A place to think, write, and turn what you discover into something you can use.\n\n## Make room for a good idea\n\nYour notes are ordinary **Markdown**. Write freely, keep a useful example, and leave a question for your future self. Use the **Write**, **Split**, and **Read** controls above to find your rhythm.\n\n> Understanding begins when you can explain an idea in your own words.\n\n## Beautiful equations, included\n\nUse a single dollar sign for inline math, like $e^{i\\pi} + 1 = 0$, and double dollar signs for a formula that deserves its own space:\n\n$$\n\\int_a^b f(x)\\,dx = F(b) - F(a)\n$$\n\nCode belongs here, too:\n\n\`\`\`rust\nfn main() {\n    let idea = "Stay curious.";\n    println!("{idea}");\n}\n\`\`\`\n\n## Keep what matters\n\n- **Reference** keeps a note in your library, without reviews.\n- **Remember** adds recall and explanation prompts to practice.\n- **Apply** also includes problems that put an idea to work.\n\nOpen the learning panel to choose a goal and write questions. Your answers stay hidden until you have made an attempt.\n\n## Bring your conversations along\n\nOpen **Capture** to import a Markdown summary from ChatGPT. The connection guide includes a reusable prompt and instructions for the local save tool. Summarization happens in your existing chat.\n\n---\n\nThis is an example note. Edit it, make it yours, or move it to Trash.`,
    },
    {
      ...base,
      id: 'retrieval-and-understanding',
      title: 'Learning that stays with you',
      collection: 'Learning science',
      tags: ['retrieval', 'learning'],
      intent: 'apply',
      body: `Reading can make an explanation feel familiar. A useful next step is to close the note and try to reconstruct the idea.\n\n## Recall before you reveal\n\nRetrieval practice can improve later retention compared with additional study. In experiments with prose passages, testing showed its advantage on delayed tests, even when restudying felt more effective.\n\n## Explain the mechanism\n\nAsk yourself why a step works, what assumption it depends on, and how it relates to something you already know. Check your explanation against the source afterward.\n\n## Try a different example\n\nBeing able to repeat a definition and being able to use it are different outcomes. Practice with a changed example, and measure them separately.\n\n## Evidence and limits\n\nThese findings support the activities. They do not validate this app, a particular review schedule, or a guaranteed learning-speed improvement. Lumen records self-assessments; it does not infer mastery.\n\n- [Roediger & Karpicke (2006): test-enhanced learning](https://doi.org/10.1111/j.1467-9280.2006.01693.x)\n- [Chi et al. (1994): self-explanation](https://doi.org/10.1207/s15516709cog1803_3)\n- [Butler (2010): retrieval and transfer](https://doi.org/10.1037/a0019902)`,
      prompts: [
        {
          id: 'retrieval-recall',
          kind: 'recall',
          question: 'What is retrieval practice, and how does it differ from rereading?',
          answer:
            'Attempt to reconstruct information from memory before consulting the source. Rereading exposes you to the answer again; retrieval asks you to produce it.',
        },
        {
          id: 'retrieval-explain',
          kind: 'explain',
          question:
            'Why is feeling familiar with a note insufficient evidence that you can use the idea later?',
          answer:
            'Familiarity while the answer is visible does not demonstrate unaided recall or application. A delayed test and a new problem measure those outcomes more directly.',
        },
        {
          id: 'retrieval-apply',
          kind: 'apply',
          question:
            'You just learned a new algorithm. Design a short activity that checks more than your memory of its name.',
          answer:
            'For example: predict the algorithm’s behavior on an unseen input, explain each step, and identify a case where its assumptions fail. Compare your work with a reliable explanation or executable test.',
        },
      ],
    },
    {
      ...base,
      id: 'markdown-field-guide',
      title: 'Your Markdown field guide',
      collection: 'Getting started',
      tags: ['markdown', 'math'],
      body: `Keep the writing simple. The formatting will follow.\n\n## The essentials\n\nUse **bold** for emphasis, *italics* for a quieter aside, and \`inline code\` for a symbol or a command.\n\n| What you want | What you write |\n| :--- | :--- |\n| A heading | \`## Heading\` |\n| A link | \`[label](https://example.com)\` |\n| A task | \`- [ ] Something to do\` |\n| Inline math | \`$x^2$\` |\n\n## Equations\n\nKaTeX renders your math locally, including fractions, matrices, integrals, and aligned equations:\n\n$$\n\\begin{aligned}\nf(x) &= x^2 \\\\\nf'(x) &= 2x\n\\end{aligned}\n$$\n\nUse \`$...$\` or \`$$...$$\` delimiters. This is LaTeX **math** support, not a full document compiler.\n\n## A small checklist\n\n- [x] Give your thought a title\n- [ ] Add an example\n- [ ] Write a question worth answering\n\n## Useful shortcuts\n\n- **⌘ N** creates a note.\n- **⌘ K** finds a note.\n- **⌘ S** saves immediately.\n- **⌘ B** and **⌘ I** format selected editor text.\n- **⌘ ⇧ F** enters focus mode.\n\nOn Windows and Linux, use Ctrl in place of ⌘.`,
    },
  ];
}

export const capturePrompt = `Summarize the useful ideas from this conversation as a concise learning note in Markdown. Keep the core explanation to roughly 100–180 words; preserve important conditions and uncertainties. Include one minimal example, a limitation or misconception, and source links already present in the conversation. Do not invent sources. Preserve technical notation using $...$ and $$...$$ for math.

Add a "Check yourself" section with one recall question, one explanation question, and one application problem, followed by a separate "Suggested answers" section. Label unverified claims. If the Lumen save_note tool is available, use it to save the note to the inbox with structured prompts and answers. Otherwise return a downloadable .md file with a # title.`;
