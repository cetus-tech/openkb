import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { createHighlighter, type Highlighter } from 'shiki';
import type { Knowledge } from '@/utils/api';

// ---------------------------------------------------------------------------
// Shiki highlighter — initialised once, shared across all renders.
// Uses dual-theme (light + dark) with CSS variable overrides for .dark mode.
// ---------------------------------------------------------------------------

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({
            themes: ['github-light', 'github-dark'],
            langs: [
                'typescript',
                'javascript',
                'tsx',
                'jsx',
                'vue',
                'html',
                'css',
                'scss',
                'python',
                'go',
                'rust',
                'java',
                'c',
                'cpp',
                'bash',
                'shell',
                'powershell',
                'json',
                'yaml',
                'toml',
                'xml',
                'sql',
                'graphql',
                'markdown',
                'diff',
                'plaintext',
            ],
        });
    }
    return highlighterPromise;
}

// Pre-warm the highlighter on module load so first render has no delay.
getHighlighter().catch(() => {
    /* handled per-call below */
});

// ---------------------------------------------------------------------------
// marked renderer with shiki code blocks
// ---------------------------------------------------------------------------

let markedConfigured = false;
let cachedHighlighter: Highlighter | null = null;

async function ensureMarked(): Promise<void> {
    if (markedConfigured) return;
    cachedHighlighter = await getHighlighter();
    marked.use({
        renderer: {
            code({ text, lang }: { text: string; lang?: string }): string {
                const language =
                    lang?.split(/[\s,{]/)[0]?.trim() || 'plaintext';
                try {
                    return cachedHighlighter!.codeToHtml(text, {
                        lang: language,
                        themes: { light: 'github-light', dark: 'github-dark' },
                        defaultColor: 'light',
                    });
                } catch {
                    // Fallback to plaintext if language is not loaded
                    return cachedHighlighter!.codeToHtml(text, {
                        lang: 'plaintext',
                        themes: { light: 'github-light', dark: 'github-dark' },
                        defaultColor: 'light',
                    });
                }
            },
        },
    });
    markedConfigured = true;
}

/** Render Markdown to sanitized HTML (shared by docs, preview panes, edit workspace). */
export async function renderMarkdown(source: string): Promise<string> {
    const text = source?.trim();
    if (!text) return '';
    try {
        await ensureMarked();
        const raw = marked.parse(text, { async: false }) as string;
        // Allow style attrs (shiki puts inline colours via CSS vars) and data attrs.
        return DOMPurify.sanitize(raw, {
            ADD_ATTR: ['style', 'tabindex'],
            ALLOW_DATA_ATTR: false,
        });
    } catch {
        return '<p>Failed to render markdown.</p>';
    }
}

export function slugify(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function yamlQuote(value: string): string {
    return JSON.stringify(value);
}

function parseYamlScalar(raw: string): string {
    const value = raw.trim();
    if (!value) return '';
    if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
    ) {
        try {
            return JSON.parse(
                value.startsWith("'")
                    ? `"${value.slice(1, -1).replace(/"/g, '\\"')}"`
                    : value,
            ) as string;
        } catch {
            return value.slice(1, -1);
        }
    }
    return value;
}

export interface ParsedKnowledgeMarkdown {
    slug: string;
    title: string;
    summary: string;
    type: string;
    status: string;
    content: string;
    createdBy?: string;
    scope: { projectSlug?: string; pathPatterns?: string[] };
}

/** Parse OpenKB-exported Markdown (YAML front matter + body). */
export function parseExportedMarkdown(
    raw: string,
    fileName: string,
): ParsedKnowledgeMarkdown {
    const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const meta: Record<string, string> = {};
    const lists: Record<string, string[]> = {};
    let body = text;

    if (text.startsWith('---\n')) {
        const end = text.indexOf('\n---\n', 4);
        if (end >= 0) {
            const fm = text.slice(4, end);
            body = text.slice(end + 5);
            let listKey: string | null = null;
            for (const line of fm.split('\n')) {
                const listItem = line.match(/^\s+-\s+(.*)$/);
                if (listItem && listKey) {
                    lists[listKey] = lists[listKey] ?? [];
                    lists[listKey].push(parseYamlScalar(listItem[1] ?? ''));
                    continue;
                }
                const kv = line.match(/^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/);
                if (!kv) {
                    listKey = null;
                    continue;
                }
                const key = kv[1] ?? '';
                const rest = (kv[2] ?? '').trim();
                if (!rest && key === 'pathPatterns') {
                    listKey = key;
                    lists[key] = lists[key] ?? [];
                    continue;
                }
                listKey = null;
                meta[key] = parseYamlScalar(rest);
            }
        }
    }

    const baseName = fileName.replace(/\.md$/i, '');
    const content = body.trim() ? body.replace(/^\n+/, '') : '';
    const titleFromHeading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const title =
        meta.title || titleFromHeading || baseName || 'Imported knowledge';
    const slug =
        meta.slug ||
        slugify(title) ||
        slugify(baseName) ||
        `import-${Date.now()}`;
    const summary = meta.summary || title;
    const type = meta.type || 'context';
    const status = meta.status === 'inactive' ? 'inactive' : 'active';
    const createdBy =
        meta.created_by || meta.createdBy || meta.author || undefined;
    const scope: ParsedKnowledgeMarkdown['scope'] = {};
    if (meta.projectSlug) scope.projectSlug = meta.projectSlug;
    if (lists.pathPatterns?.length)
        scope.pathPatterns = lists.pathPatterns.filter(Boolean);

    return {
        slug,
        title,
        summary,
        type,
        status,
        content: content || `# ${title}\n`,
        createdBy,
        scope,
    };
}

/** Build OpenKB Markdown export and trigger browser download. */
export function exportKnowledgeMarkdown(knowledge: Knowledge): void {
    const scope = knowledge.scope ?? {};
    const frontMatterLines = [
        '---',
        `slug: ${yamlQuote(knowledge.slug)}`,
        `title: ${yamlQuote(knowledge.title)}`,
        `summary: ${yamlQuote(knowledge.summary)}`,
        `type: ${yamlQuote(knowledge.type)}`,
        `status: ${yamlQuote(knowledge.status)}`,
        `version: ${knowledge.version}`,
    ];
    if (knowledge.createdBy)
        frontMatterLines.push(`created_by: ${yamlQuote(knowledge.createdBy)}`);
    if (scope.projectSlug)
        frontMatterLines.push(`projectSlug: ${yamlQuote(scope.projectSlug)}`);
    if (scope.pathPatterns?.length) {
        frontMatterLines.push('pathPatterns:');
        for (const pattern of scope.pathPatterns)
            frontMatterLines.push(`  - ${yamlQuote(pattern)}`);
    }
    frontMatterLines.push('---', '');

    const body = knowledge.content?.trim()
        ? knowledge.content.replace(/\r\n/g, '\n')
        : `# ${knowledge.title}\n`;
    const markdown = `${frontMatterLines.join('\n')}${body.endsWith('\n') ? body : `${body}\n`}`;

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${knowledge.slug || 'knowledge'}.md`;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
