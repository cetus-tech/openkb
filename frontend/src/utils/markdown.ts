import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import githubLight from 'shiki/themes/github-light.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';
import langTypeScript from 'shiki/langs/typescript.mjs';
import langJavaScript from 'shiki/langs/javascript.mjs';
import langTsx from 'shiki/langs/tsx.mjs';
import langJsx from 'shiki/langs/jsx.mjs';
import langVue from 'shiki/langs/vue.mjs';
import langHtml from 'shiki/langs/html.mjs';
import langCss from 'shiki/langs/css.mjs';
import langScss from 'shiki/langs/scss.mjs';
import langPython from 'shiki/langs/python.mjs';
import langGo from 'shiki/langs/go.mjs';
import langRust from 'shiki/langs/rust.mjs';
import langJava from 'shiki/langs/java.mjs';
import langC from 'shiki/langs/c.mjs';
import langCpp from 'shiki/langs/cpp.mjs';
import langBash from 'shiki/langs/bash.mjs';
import langShell from 'shiki/langs/shell.mjs';
import langPowerShell from 'shiki/langs/powershell.mjs';
import langJson from 'shiki/langs/json.mjs';
import langYaml from 'shiki/langs/yaml.mjs';
import langToml from 'shiki/langs/toml.mjs';
import langXml from 'shiki/langs/xml.mjs';
import langSql from 'shiki/langs/sql.mjs';
import langGraphql from 'shiki/langs/graphql.mjs';
import langMarkdown from 'shiki/langs/markdown.mjs';
import langDiff from 'shiki/langs/diff.mjs';
import type { Knowledge } from '@/utils/api';

// ---------------------------------------------------------------------------
// Shiki highlighter — initialised once, shared across all renders. Built from
// the core API with only the languages used in this app (the full 'shiki'
// bundle pulls in ~300 grammar chunks). Dual-theme (light + dark) with CSS
// variable overrides for .dark mode.
// ---------------------------------------------------------------------------

const highlighterLangs = [
    langTypeScript,
    langJavaScript,
    langTsx,
    langJsx,
    langVue,
    langHtml,
    langCss,
    langScss,
    langPython,
    langGo,
    langRust,
    langJava,
    langC,
    langCpp,
    langBash,
    langShell,
    langPowerShell,
    langJson,
    langYaml,
    langToml,
    langXml,
    langSql,
    langGraphql,
    langMarkdown,
    langDiff,
];

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighterCore({
            themes: [githubLight, githubDark],
            langs: highlighterLangs,
            engine: createOnigurumaEngine(import('shiki/wasm')),
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
let cachedHighlighter: HighlighterCore | null = null;

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

export function replaceDocSiteUrl(source: string): string {
    if (!source) return '';
    if (typeof window !== 'undefined' && window.location?.origin) {
        const origin = window.location.origin;
        let processed = source.replaceAll('http://localhost:6800', origin);
        if (origin.startsWith('https://')) {
            processed = processed.replaceAll('https://kb.example.com', origin);
        }
        return processed;
    }
    return source;
}

/** Render Markdown to sanitized HTML (shared by docs, preview panes, edit workspace). */
export async function renderMarkdown(source: string): Promise<string> {
    const text = replaceDocSiteUrl(source)?.trim();
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
    scope: {
        projectSlug?: string;
        pathPatterns?: string[];
        stacks?: string[];
    };
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
                if (!rest && (key === 'pathPatterns' || key === 'stacks')) {
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
    if (lists.stacks?.length)
        scope.stacks = lists.stacks.filter(Boolean);

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
    if (scope.stacks?.length) {
        frontMatterLines.push('stacks:');
        for (const stack of scope.stacks)
            frontMatterLines.push(`  - ${yamlQuote(stack)}`);
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
