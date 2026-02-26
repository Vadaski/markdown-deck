import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { marked, type Tokens } from 'marked';
import katex from 'katex';
import mermaid from 'mermaid';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  type BundledTheme,
} from 'shiki';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';

import 'katex/dist/katex.min.css';
import 'monaco-editor/min/vs/editor/editor.main.css';

type ThemeId = 'minimal' | 'corporate' | 'hacker' | 'academic' | 'vibrant';

interface ThemeConfig {
  id: ThemeId;
  label: string;
  shikiTheme: BundledTheme;
  mermaidTheme: 'default' | 'neutral' | 'dark' | 'forest';
  monacoTheme: 'vs' | 'vs-dark';
}

interface Slide {
  id: number;
  title: string;
  markdown: string;
  html: string;
  notes: string;
}

interface HashState {
  slideIndex: number;
  themeId: ThemeId;
  presenter: boolean;
}

interface SharedState {
  markdown: string;
  currentSlide: number;
  themeId: ThemeId;
}

interface SharedMessage {
  sourceId: string;
  state: SharedState;
}

const STORAGE_KEY = 'markdown-deck:last-markdown';
const SHARED_STATE_KEY = 'markdown-deck:shared-state';
const CHANNEL_NAME = 'markdown-deck-sync';
const DEFAULT_THEME_ID: ThemeId = 'corporate';
const EDITOR_SPLIT_KEY = 'markdown-deck:editor-split';
const SHOW_LINE_NUMBERS_KEY = 'markdown-deck:show-line-numbers';
const MIN_EDITOR_SPLIT = 28;
const MAX_EDITOR_SPLIT = 72;
const DEFAULT_EDITOR_SPLIT = 42;

const THEME_CONFIG: Record<ThemeId, ThemeConfig> = {
  minimal: {
    id: 'minimal',
    label: 'Quartz',
    shikiTheme: 'github-light',
    mermaidTheme: 'neutral',
    monacoTheme: 'vs',
  },
  corporate: {
    id: 'corporate',
    label: 'Studio',
    shikiTheme: 'github-dark',
    mermaidTheme: 'default',
    monacoTheme: 'vs-dark',
  },
  hacker: {
    id: 'hacker',
    label: 'Hacker',
    shikiTheme: 'monokai',
    mermaidTheme: 'dark',
    monacoTheme: 'vs-dark',
  },
  academic: {
    id: 'academic',
    label: 'Academic',
    shikiTheme: 'vitesse-light',
    mermaidTheme: 'neutral',
    monacoTheme: 'vs',
  },
  vibrant: {
    id: 'vibrant',
    label: 'Vibrant',
    shikiTheme: 'nord',
    mermaidTheme: 'forest',
    monacoTheme: 'vs-dark',
  },
};

const DEFAULT_MARKDOWN = `# Markdown Deck
### The elegant way to turn ideas into slides

- Write Markdown, see slides instantly
- Drag to resize editor and stage
- Toggle line numbers and switch themes live
- Open presenter mode with **P** for current/next/timer/notes

::: notes
Frame this as "from draft to keynote in one workspace."
:::

---

## Why teams use Markdown Deck

| Need | Built-in experience |
| --- | --- |
| Rapid writing | Monaco editor + keyboard workflow |
| Delivery quality | Smooth transitions and polished themes |
| Technical storytelling | Shiki, Mermaid, and KaTeX support |
| Speaker confidence | Presenter mode with notes and timer |

> A single workflow from outline to delivery.

---

## Live TypeScript snippet

\`\`\`ts
type Milestone = {
  title: string;
  owner: string;
  confidence: number;
};

const roadmap: Milestone[] = [
  { title: 'Theme presets', owner: 'Design', confidence: 0.92 },
  { title: 'Presenter sync', owner: 'Platform', confidence: 0.88 },
  { title: 'Export polish', owner: 'Infra', confidence: 0.85 },
];

const highest = roadmap.reduce((best, next) =>
  next.confidence > best.confidence ? next : best,
);

console.log(\`Most confident: \${highest.title} (\${highest.owner})\`);
\`\`\`

::: notes
Mention line numbers for code walkthroughs.
:::

---

## System diagram

\`\`\`mermaid
flowchart LR
  A[Markdown Input] --> B[Slide Parser]
  B --> C[Renderer]
  C --> D[Live Preview]
  C --> E[Presenter Window]
  C --> F[Print / PDF]
\`\`\`

---

## Math-ready storytelling

Inline: $e^{i\\pi} + 1 = 0$

$$
\\operatorname*{arg\\,max}_{theme \\in T}
\\big(clarity(theme) + delight(theme)\\big)
$$

$$
FocusScore = \\frac{signal}{noise + friction}
$$

---

## Speaker workflow

1. Keep writing in the editor.
2. Advance slides with Arrow keys or Space.
3. Press **P** for presenter mode.
4. Use timer + notes to stay on script.

Note: Close strong with one clear CTA and one measurable next step.

::: notes
Call out that presenter mode mirrors slide/theme/position in real time.
:::

---

## Build once, publish anywhere

- Vite base configured for GitHub Pages
- Deploy workflow ships \`dist/\` automatically
- No custom runtime server required

### Ready for your next demo

Thank you.`;

const LANG_ALIAS: Record<string, BundledLanguage> = {
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  json: 'json',
  bash: 'bash',
  sh: 'bash',
  md: 'markdown',
  markdown: 'markdown',
};

const BUNDLED_THEMES: BundledTheme[] = [
  'github-light',
  'github-dark',
  'monokai',
  'vitesse-light',
  'nord',
];

const BUNDLED_LANGS: BundledLanguage[] = [
  'javascript',
  'typescript',
  'python',
  'json',
  'bash',
  'markdown',
];

const monacoGlobal = self as unknown as {
  MonacoEnvironment?: {
    getWorker: (_moduleId: string, label: string) => Worker;
  };
};

if (!monacoGlobal.MonacoEnvironment) {
  monacoGlobal.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string): Worker {
      if (label === 'typescript' || label === 'javascript') {
        return new tsWorker();
      }
      if (label === 'json') {
        return new jsonWorker();
      }
      if (label === 'css' || label === 'scss' || label === 'less') {
        return new cssWorker();
      }
      if (label === 'html' || label === 'handlebars' || label === 'razor') {
        return new htmlWorker();
      }
      return new editorWorker();
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function readStoredNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = window.localStorage.getItem(key);
  const parsed = Number.parseFloat(raw ?? '');
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(parsed, min, max);
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }
  return raw === '1';
}

function formatElapsedTimer(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
      2,
      '0',
    )}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function escapeHtml(content: string): string {
  return content
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeDatasetValue(value: string | undefined): string {
  if (!value) {
    return '';
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveLanguage(rawLang: string | undefined): BundledLanguage | null {
  if (!rawLang) {
    return null;
  }
  const normalized = rawLang.trim().toLowerCase();
  return LANG_ALIAS[normalized] ?? null;
}

function extractTitle(markdown: string, fallbackIndex: number): string {
  const headingMatch = markdown.match(/^\s{0,3}#{1,2}\s+(.+)$/m);
  if (headingMatch?.[1]) {
    return headingMatch[1].trim();
  }
  return `Slide ${fallbackIndex + 1}`;
}

function markdownToHtml(content: string): string {
  const renderer = new marked.Renderer();

  renderer.code = ({ text, lang }: Tokens.Code): string => {
    const encodedCode = encodeURIComponent(text);
    const cleanLang = (lang ?? '').trim().toLowerCase();

    if (cleanLang === 'mermaid') {
      return `<div class="md-mermaid" data-mermaid="${encodedCode}"></div>`;
    }

    return `<pre class="md-code" data-lang="${escapeHtml(cleanLang)}" data-code="${encodedCode}"></pre>`;
  };

  return marked.parse(content, {
    renderer,
    gfm: true,
    breaks: true,
  }) as string;
}

function parseSlides(markdown: string): Slide[] {
  const rawSlides = markdown.split(/^\s*---\s*$/gm);

  return rawSlides.map((rawSlide, index) => {
    const noteCollection: string[] = [];

    let content = rawSlide.replace(/::: ?notes\s*([\s\S]*?):::/gi, (_match, notes: string) => {
      const trimmedNotes = notes.trim();
      if (trimmedNotes) {
        noteCollection.push(trimmedNotes);
      }
      return '';
    });

    content = content.replace(/^Note:\s*(.+)$/gim, (_match, note: string) => {
      const trimmedNote = note.trim();
      if (trimmedNote) {
        noteCollection.push(trimmedNote);
      }
      return '';
    });

    const normalizedContent = content.trim() || '_Empty slide_';

    return {
      id: index,
      title: extractTitle(normalizedContent, index),
      markdown: normalizedContent,
      html: markdownToHtml(normalizedContent),
      notes: noteCollection.join('\n\n').trim() || 'No speaker notes for this slide.',
    };
  });
}

function readHashState(): HashState {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const requestedTheme = params.get('theme');
  const requestedSlide = Number.parseInt(params.get('slide') ?? '1', 10);

  const themeId =
    requestedTheme && requestedTheme in THEME_CONFIG
      ? (requestedTheme as ThemeId)
      : DEFAULT_THEME_ID;

  return {
    slideIndex: Number.isFinite(requestedSlide) ? Math.max(0, requestedSlide - 1) : 0,
    themeId,
    presenter: params.get('presenter') === '1',
  };
}

async function enhanceCodeBlocks(
  root: HTMLElement,
  highlighter: Highlighter | null,
  theme: BundledTheme,
  showLineNumbers: boolean,
): Promise<void> {
  const codeBlocks = Array.from(root.querySelectorAll<HTMLElement>('pre.md-code'));

  for (const placeholder of codeBlocks) {
    const code = decodeDatasetValue(placeholder.dataset.code);
    const rawLang = decodeDatasetValue(placeholder.dataset.lang);
    const lang = resolveLanguage(rawLang);

    if (!highlighter || !lang) {
      const plainPre = document.createElement('pre');
      plainPre.className = 'deck-code deck-code-plain';
      const codeNode = document.createElement('code');
      codeNode.textContent = code;
      plainPre.append(codeNode);
      placeholder.replaceWith(plainPre);
      continue;
    }

    let html = '';
    try {
      html = highlighter.codeToHtml(code, {
        lang,
        theme,
      });
    } catch {
      const plainPre = document.createElement('pre');
      plainPre.className = 'deck-code deck-code-plain';
      const codeNode = document.createElement('code');
      codeNode.textContent = code;
      plainPre.append(codeNode);
      placeholder.replaceWith(plainPre);
      continue;
    }

    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const highlightedPre = parsed.body.firstElementChild as HTMLElement | null;

    if (!highlightedPre) {
      continue;
    }

    highlightedPre.classList.add('deck-code');
    highlightedPre.classList.toggle('deck-code-with-lines', showLineNumbers);
    const lines = Array.from(highlightedPre.querySelectorAll<HTMLElement>('.line'));
    lines.forEach((line, index) => {
      line.classList.add('deck-code-line');
      line.setAttribute('data-line-number', String(index + 1));
      line.style.animationDelay = `${index * 70}ms`;
    });

    placeholder.replaceWith(highlightedPre);
  }
}

function shouldSkipMathNode(parent: HTMLElement | null): boolean {
  if (!parent) {
    return true;
  }

  if (parent.closest('.katex')) {
    return true;
  }

  const disallowedTags = new Set([
    'PRE',
    'CODE',
    'SCRIPT',
    'STYLE',
    'TEXTAREA',
    'SVG',
  ]);

  return disallowedTags.has(parent.tagName);
}

function enhanceMath(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];

  let currentNode: Node | null = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    if (textNode.nodeValue?.includes('$') && !shouldSkipMathNode(textNode.parentElement)) {
      targets.push(textNode);
    }
    currentNode = walker.nextNode();
  }

  const mathPattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

  targets.forEach((textNode) => {
    const originalText = textNode.nodeValue ?? '';
    let cursor = 0;
    let matched = false;

    const fragment = document.createDocumentFragment();

    for (const match of originalText.matchAll(mathPattern)) {
      matched = true;
      const matchedText = match[0] ?? '';
      const start = match.index ?? 0;

      if (start > cursor) {
        fragment.append(document.createTextNode(originalText.slice(cursor, start)));
      }

      const expression = (match[1] ?? match[2] ?? '').trim();
      const displayMode = Boolean(match[1]);

      const mathNode = document.createElement(displayMode ? 'div' : 'span');
      mathNode.className = displayMode ? 'math-display' : 'math-inline';

      try {
        mathNode.innerHTML = katex.renderToString(expression, {
          displayMode,
          throwOnError: false,
          strict: 'ignore',
        });
      } catch {
        mathNode.textContent = matchedText;
      }

      fragment.append(mathNode);
      cursor = start + matchedText.length;
    }

    if (!matched) {
      return;
    }

    if (cursor < originalText.length) {
      fragment.append(document.createTextNode(originalText.slice(cursor)));
    }

    textNode.replaceWith(fragment);
  });
}

async function enhanceMermaid(
  root: HTMLElement,
  mermaidTheme: ThemeConfig['mermaidTheme'],
  slideId: number,
): Promise<void> {
  const diagrams = Array.from(root.querySelectorAll<HTMLElement>('.md-mermaid'));

  if (!diagrams.length) {
    return;
  }

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: mermaidTheme,
  });

  await Promise.all(
    diagrams.map(async (target, index) => {
      const definition = decodeDatasetValue(target.dataset.mermaid);
      const renderId = `mermaid-${slideId}-${index}-${Date.now()}`;

      try {
        const { svg } = await mermaid.render(renderId, definition);
        target.innerHTML = svg;
        target.classList.add('mermaid-ready');
      } catch (error) {
        const renderedError =
          error instanceof Error ? error.message : 'Failed to render Mermaid diagram.';
        target.innerHTML = `<pre class="mermaid-error">${escapeHtml(renderedError)}</pre>`;
      }
    }),
  );
}

interface SlideRendererProps {
  slide: Slide;
  highlighter: Highlighter | null;
  themeConfig: ThemeConfig;
  showLineNumbers: boolean;
  className?: string;
}

function SlideRenderer({
  slide,
  highlighter,
  themeConfig,
  showLineNumbers,
  className,
}: SlideRendererProps): ReactElement {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) {
      return;
    }

    let active = true;
    let mermaidTimer: number | null = null;

    const run = async () => {
      root.innerHTML = slide.html;

      await enhanceCodeBlocks(
        root,
        highlighter,
        themeConfig.shikiTheme,
        showLineNumbers,
      );
      if (!active) {
        return;
      }

      enhanceMath(root);

      mermaidTimer = window.setTimeout(() => {
        if (!active) {
          return;
        }
        void enhanceMermaid(root, themeConfig.mermaidTheme, slide.id);
      }, 140);
    };

    void run();

    return () => {
      active = false;
      if (mermaidTimer !== null) {
        window.clearTimeout(mermaidTimer);
      }
    };
  }, [
    slide.id,
    slide.html,
    highlighter,
    showLineNumbers,
    themeConfig.mermaidTheme,
    themeConfig.shikiTheme,
  ]);

  return (
    <article className={`slide-render ${className ?? ''}`}>
      <div
        ref={contentRef}
        className="slide-markdown"
        dangerouslySetInnerHTML={{ __html: slide.html }}
      />
    </article>
  );
}

function safeParseSharedState(rawState: string | null): SharedState | null {
  if (!rawState) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawState) as Partial<SharedState>;
    if (
      typeof parsed.markdown === 'string' &&
      typeof parsed.currentSlide === 'number' &&
      typeof parsed.themeId === 'string' &&
      parsed.themeId in THEME_CONFIG
    ) {
      return {
        markdown: parsed.markdown,
        currentSlide: parsed.currentSlide,
        themeId: parsed.themeId as ThemeId,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export default function App(): ReactElement {
  const initialHash = useMemo(readHashState, []);

  const [isPresenterWindow] = useState<boolean>(initialHash.presenter);
  const [themeId, setThemeId] = useState<ThemeId>(initialHash.themeId);
  const [markdown, setMarkdown] = useState<string>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ?? DEFAULT_MARKDOWN;
  });
  const [currentSlide, setCurrentSlide] = useState<number>(initialHash.slideIndex);
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [editorSplit, setEditorSplit] = useState<number>(() =>
    readStoredNumber(
      EDITOR_SPLIT_KEY,
      DEFAULT_EDITOR_SPLIT,
      MIN_EDITOR_SPLIT,
      MAX_EDITOR_SPLIT,
    ),
  );
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(() =>
    readStoredBoolean(SHOW_LINE_NUMBERS_KEY, true),
  );
  const [slideTransitionDirection, setSlideTransitionDirection] = useState<
    'forward' | 'backward'
  >('forward');
  const [presenterSeconds, setPresenterSeconds] = useState(0);
  const [isPresenterTimerRunning, setIsPresenterTimerRunning] = useState(true);

  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const isProgrammaticEditorChangeRef = useRef(false);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const clientIdRef = useRef(
    `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  );

  const slides = useMemo(() => parseSlides(markdown), [markdown]);
  const maxSlideIndex = Math.max(0, slides.length - 1);

  useEffect(() => {
    setCurrentSlide((index) => clamp(index, 0, maxSlideIndex));
  }, [maxSlideIndex]);

  const themeConfig = THEME_CONFIG[themeId];

  const goToSlide = useCallback(
    (index: number) => {
      setCurrentSlide((previous) => {
        const next = clamp(index, 0, maxSlideIndex);
        if (next > previous) {
          setSlideTransitionDirection('forward');
        } else if (next < previous) {
          setSlideTransitionDirection('backward');
        }
        return next;
      });
    },
    [maxSlideIndex],
  );

  const nextSlide = useCallback(() => {
    setCurrentSlide((index) => {
      const next = clamp(index + 1, 0, maxSlideIndex);
      if (next !== index) {
        setSlideTransitionDirection('forward');
      }
      return next;
    });
  }, [maxSlideIndex]);

  const previousSlide = useCallback(() => {
    setCurrentSlide((index) => {
      const next = clamp(index - 1, 0, maxSlideIndex);
      if (next !== index) {
        setSlideTransitionDirection('backward');
      }
      return next;
    });
  }, [maxSlideIndex]);

  useEffect(() => {
    let isDisposed = false;
    let activeHighlighter: Highlighter | null = null;

    void createHighlighter({
      themes: BUNDLED_THEMES,
      langs: BUNDLED_LANGS,
    })
      .then((instance) => {
        if (isDisposed) {
          instance.dispose();
          return;
        }
        activeHighlighter = instance;
        setHighlighter(instance);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Unknown Shiki error';
        setEditorError((previous) => previous ?? `Shiki failed to initialize: ${message}`);
      });

    return () => {
      isDisposed = true;
      activeHighlighter?.dispose();
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_SPLIT_KEY, editorSplit.toString());
  }, [editorSplit]);

  useEffect(() => {
    window.localStorage.setItem(
      SHOW_LINE_NUMBERS_KEY,
      showLineNumbers ? '1' : '0',
    );
  }, [showLineNumbers]);

  useEffect(() => {
    if (!isDraggingDivider) {
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      const workspace = workspaceRef.current;
      if (!workspace) {
        return;
      }

      const bounds = workspace.getBoundingClientRect();
      if (bounds.width <= 0) {
        return;
      }

      const raw = ((event.clientX - bounds.left) / bounds.width) * 100;
      setEditorSplit(clamp(raw, MIN_EDITOR_SPLIT, MAX_EDITOR_SPLIT));
    };

    const stopDragging = () => {
      setIsDraggingDivider(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    document.body.classList.add('is-resizing-divider');

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
      document.body.classList.remove('is-resizing-divider');
    };
  }, [isDraggingDivider]);

  useEffect(() => {
    if (!isPresenterWindow || !isPresenterTimerRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setPresenterSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isPresenterTimerRunning, isPresenterWindow]);

  useEffect(() => {
    if (isPresenterWindow) {
      return;
    }

    const mountPoint = editorContainerRef.current;
    if (!mountPoint) {
      return;
    }

    let animationFrame = 0;

    try {
      const model = monaco.editor.createModel(markdown, 'markdown');
      const editor = monaco.editor.create(mountPoint, {
        model,
        automaticLayout: true,
        lineNumbers: 'on',
        minimap: { enabled: false },
        theme: 'vs-dark',
        fontSize: 14,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
        smoothScrolling: true,
        wordWrap: 'on',
        wrappingIndent: 'same',
      });

      editorRef.current = editor;

      const changeListener = editor.onDidChangeModelContent(() => {
        if (isProgrammaticEditorChangeRef.current) {
          return;
        }

        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
        }

        animationFrame = window.requestAnimationFrame(() => {
          setMarkdown(editor.getValue());
        });
      });

      return () => {
        changeListener.dispose();
        if (animationFrame) {
          window.cancelAnimationFrame(animationFrame);
        }
        editor.dispose();
        model.dispose();
        editorRef.current = null;
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Monaco error';
      setEditorError(`Monaco failed to initialize: ${message}`);
      return;
    }
  }, [isPresenterWindow]);

  useEffect(() => {
    if (isPresenterWindow || !editorRef.current) {
      return;
    }
    monaco.editor.setTheme(themeConfig.monacoTheme);
  }, [isPresenterWindow, themeConfig.monacoTheme]);

  useEffect(() => {
    if (isPresenterWindow) {
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    if (editor.getValue() === markdown) {
      return;
    }

    isProgrammaticEditorChangeRef.current = true;
    editor.setValue(markdown);
    isProgrammaticEditorChangeRef.current = false;
  }, [isPresenterWindow, markdown]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, markdown);
  }, [markdown]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    params.set('slide', String(currentSlide + 1));
    params.set('theme', themeId);

    if (isPresenterWindow) {
      params.set('presenter', '1');
    } else {
      params.delete('presenter');
    }

    const hash = params.toString();
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`,
    );
  }, [currentSlide, isPresenterWindow, themeId]);

  useEffect(() => {
    const onHashChange = () => {
      const nextHashState = readHashState();
      setThemeId(nextHashState.themeId);
      goToSlide(nextHashState.slideIndex);
    };

    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [goToSlide]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    syncChannelRef.current = channel;

    channel.onmessage = (event: MessageEvent<SharedMessage>) => {
      const payload = event.data;
      if (!payload || payload.sourceId === clientIdRef.current) {
        return;
      }

      const { state } = payload;
      if (!state || !(state.themeId in THEME_CONFIG)) {
        return;
      }

      setMarkdown(state.markdown);
      setThemeId(state.themeId);
      goToSlide(state.currentSlide);
    };

    return () => {
      channel.close();
      syncChannelRef.current = null;
    };
  }, [goToSlide]);

  useEffect(() => {
    if (!isPresenterWindow) {
      return;
    }

    const sharedState = safeParseSharedState(window.localStorage.getItem(SHARED_STATE_KEY));
    if (!sharedState) {
      return;
    }

    setMarkdown(sharedState.markdown);
    setThemeId(sharedState.themeId);
    goToSlide(sharedState.currentSlide);
  }, [goToSlide, isPresenterWindow]);

  useEffect(() => {
    const state: SharedState = {
      markdown,
      currentSlide,
      themeId,
    };

    window.localStorage.setItem(SHARED_STATE_KEY, JSON.stringify(state));

    syncChannelRef.current?.postMessage({
      sourceId: clientIdRef.current,
      state,
    } satisfies SharedMessage);
  }, [currentSlide, markdown, themeId]);

  const openPresenterWindow = useCallback(() => {
    const state: SharedState = {
      markdown,
      currentSlide,
      themeId,
    };
    window.localStorage.setItem(SHARED_STATE_KEY, JSON.stringify(state));

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    params.set('slide', String(currentSlide + 1));
    params.set('theme', themeId);
    params.set('presenter', '1');

    const presenterUrl = `${window.location.pathname}${window.location.search}#${params.toString()}`;
    window.open(
      presenterUrl,
      'markdown-deck-presenter',
      'popup=yes,width=1500,height=900,left=80,top=80',
    );
  }, [currentSlide, markdown, themeId]);

  const startDividerDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (window.matchMedia('(max-width: 1180px)').matches) {
        return;
      }
      event.preventDefault();
      setIsDraggingDivider(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );

  const nudgeDivider = useCallback((delta: number) => {
    setEditorSplit((value) =>
      clamp(value + delta, MIN_EDITOR_SPLIT, MAX_EDITOR_SPLIT),
    );
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  }, []);

  const exportPdf = useCallback(() => {
    setIsPrinting(true);

    const cleanup = () => {
      setIsPrinting(false);
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);

    window.setTimeout(() => {
      window.print();
    }, 240);

    window.setTimeout(() => {
      cleanup();
    }, 3000);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inEditor = Boolean(target?.closest('.editor-pane'));

      if (event.key === 'F11') {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }

      if (event.key.toLowerCase() === 'p') {
        event.preventDefault();
        if (!isPresenterWindow) {
          openPresenterWindow();
        }
        return;
      }

      if (inEditor && !isPresenterWindow) {
        return;
      }

      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ': {
          event.preventDefault();
          nextSlide();
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp': {
          event.preventDefault();
          previousSlide();
          break;
        }
        case 'Home': {
          event.preventDefault();
          goToSlide(0);
          break;
        }
        case 'End': {
          event.preventDefault();
          goToSlide(maxSlideIndex);
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [goToSlide, isPresenterWindow, maxSlideIndex, nextSlide, openPresenterWindow, previousSlide, toggleFullscreen]);

  const currentSlideData = slides[currentSlide] ?? slides[0];
  const nextSlideData = slides[Math.min(currentSlide + 1, maxSlideIndex)] ?? slides[0];
  const presenterClock = formatElapsedTimer(presenterSeconds);
  const workspaceStyle = {
    '--editor-split': `${editorSplit}%`,
  } as CSSProperties;
  const slideTransitionClass =
    slideTransitionDirection === 'forward'
      ? 'slide-transition-forward'
      : 'slide-transition-backward';

  if (!currentSlideData) {
    return (
      <div className="empty-state">
        <h1>Markdown Deck</h1>
        <p>No slides available.</p>
      </div>
    );
  }

  if (isPresenterWindow) {
    return (
      <div className={`presenter-layout theme-${themeConfig.id}`}>
        <header className="presenter-topbar">
          <div className="presenter-heading">
            <h1>Presenter Mode</h1>
            <span>Current and next slide with live notes</span>
          </div>
          <div className="presenter-meta">
            <span className="presenter-count">
              Slide {currentSlide + 1} / {slides.length}
            </span>
            <span className="presenter-clock">{presenterClock}</span>
            <button
              type="button"
              onClick={() => {
                setIsPresenterTimerRunning((running) => !running);
              }}
            >
              {isPresenterTimerRunning ? 'Pause timer' : 'Resume timer'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPresenterSeconds(0);
                setIsPresenterTimerRunning(true);
              }}
            >
              Reset
            </button>
          </div>
        </header>

        <section className="presenter-current">
          <SlideRenderer
            slide={currentSlideData}
            highlighter={highlighter}
            themeConfig={themeConfig}
            showLineNumbers={showLineNumbers}
            className="presenter-slide"
          />
        </section>

        <aside className="presenter-sidebar">
          <h2>Next</h2>
          <SlideRenderer
            slide={nextSlideData}
            highlighter={highlighter}
            themeConfig={themeConfig}
            showLineNumbers={showLineNumbers}
            className="presenter-next"
          />

          <h2>Speaker Notes</h2>
          <div className="presenter-notes">
            {currentSlideData.notes.split('\n').map((line, index) => (
              <p key={`${currentSlideData.id}-note-${index}`}>{line}</p>
            ))}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <>
      <div className={`app-shell theme-${themeConfig.id}`}>
        <header className="toolbar">
          <div className="toolbar-left">
            <h1>Markdown Deck</h1>
            <span className="subtitle">Markdown to stunning slides</span>
          </div>

          <div className="toolbar-controls">
            <label htmlFor="theme-select">Theme</label>
            <select
              id="theme-select"
              value={themeId}
              onChange={(event) => {
                setThemeId(event.target.value as ThemeId);
              }}
            >
              {Object.values(THEME_CONFIG).map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.label}
                </option>
              ))}
            </select>

            <button type="button" onClick={previousSlide}>
              Prev
            </button>
            <button type="button" onClick={nextSlide}>
              Next
            </button>
            <button
              type="button"
              onClick={() => {
                setShowLineNumbers((visible) => !visible);
              }}
            >
              {showLineNumbers ? 'Line # On' : 'Line # Off'}
            </button>
            <button type="button" onClick={openPresenterWindow}>
              Presenter (P)
            </button>
            <button type="button" onClick={exportPdf}>
              Export PDF
            </button>
            <button type="button" onClick={() => void toggleFullscreen()}>
              Fullscreen (F11)
            </button>
          </div>
        </header>

        <main ref={workspaceRef} className="workspace" style={workspaceStyle}>
          <section className="editor-pane" aria-label="Markdown editor">
            <div className="pane-header">
              <strong>Markdown Editor</strong>
              <span>Real-time preview target: &lt;100ms</span>
            </div>

            {editorError ? (
              <div className="editor-fallback">
                <p>{editorError}</p>
                <textarea
                  value={markdown}
                  onChange={(event) => {
                    setMarkdown(event.target.value);
                  }}
                />
              </div>
            ) : (
              <div ref={editorContainerRef} className="editor-shell" />
            )}
          </section>

          <button
            type="button"
            className="workspace-divider"
            aria-label="Resize editor and preview panes"
            aria-orientation="vertical"
            aria-valuemin={MIN_EDITOR_SPLIT}
            aria-valuemax={MAX_EDITOR_SPLIT}
            aria-valuenow={Math.round(editorSplit)}
            onPointerDown={startDividerDrag}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                nudgeDivider(-2);
              } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                nudgeDivider(2);
              } else if (event.key === 'Home') {
                event.preventDefault();
                setEditorSplit(MIN_EDITOR_SPLIT);
              } else if (event.key === 'End') {
                event.preventDefault();
                setEditorSplit(MAX_EDITOR_SPLIT);
              }
            }}
          >
            <span className="workspace-divider-grip" aria-hidden="true" />
          </button>

          <section className="preview-pane" aria-label="Slide preview">
            <div className="pane-header">
              <strong>Live Preview</strong>
              <span>
                Slide {currentSlide + 1} / {slides.length}
              </span>
            </div>

            <div className="slides-viewport">
              <div
                key={`${currentSlideData.id}-${themeId}-${slideTransitionDirection}-${showLineNumbers ? 'lines' : 'plain'}`}
                className={`slide-canvas slide-transition ${slideTransitionClass}`}
              >
                <SlideRenderer
                  slide={currentSlideData}
                  highlighter={highlighter}
                  themeConfig={themeConfig}
                  showLineNumbers={showLineNumbers}
                />
              </div>
            </div>

            <nav className="slide-strip" aria-label="Slide navigator">
              {slides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  className={index === currentSlide ? 'active' : ''}
                  onClick={() => {
                    goToSlide(index);
                  }}
                >
                  <span className="slide-index">{index + 1}</span>
                  <span className="slide-title">{slide.title}</span>
                </button>
              ))}
            </nav>
          </section>
        </main>
      </div>

      {isPrinting ? (
        <div className={`print-deck theme-${themeConfig.id}`}>
          {slides.map((slide) => (
            <section key={`print-${slide.id}`} className="print-slide">
              <SlideRenderer
                slide={slide}
                highlighter={highlighter}
                themeConfig={themeConfig}
                showLineNumbers={showLineNumbers}
              />
            </section>
          ))}
        </div>
      ) : null}
    </>
  );
}
