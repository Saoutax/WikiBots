interface CleaningResult {
    text: string;
    /** 已移除的码位及次数 */
    removed: Map<string, number>;
    /** 检测到但刻意保留的码位及次数 */
    kept: Map<string, number>;
}

/**
 * 内容按字面渲染的标签，内部字符即使不可见也可能是故意保留的内容，
 * 因此整段跳过，不做任何替换。
 */
const LITERAL_TAGS = [
    'nowiki',
    'pre',
    'code',
    'syntaxhighlight',
    'source',
    'math',
    'chem',
    'score',
    'poem',
    'charinsert',
    'templatedata',
    'imagemap',
    'graph',
    'timeline',
] as const;

const LITERAL_TAG_RE = new RegExp(
    `<!--|-->|<(\\/?)(${LITERAL_TAGS.join('|')})\\b[^>]*?(\\/?)>`,
    'gi',
);

const ZERO_WIDTH_SPACE = '\u200B';

const BYTE_ORDER_MARK = '\uFEFF';

/** 零宽空格紧邻这些字符时，往往是在拆断标记语法，不能当作垃圾清理 */
const MARKUP_CHARS = new Set("{}[]|=<>#*:;'!-_~");

/** 行首锚点：紧跟在行首的零宽空格常用于阻止标题、列表等行首语法生效 */
const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

const isMarkup = (char: string | undefined): boolean =>
    char !== undefined && MARKUP_CHARS.has(char);

const isLineStart = (char: string | undefined): boolean =>
    char === undefined || WHITESPACE.has(char);

/**
 * 只检测、不删除的码位。它们都承载实际语义：
 * 变体选择符决定字形，双向控制符决定混排方向，不可见运算符决定数学含义，
 * 谚文填充符参与音节合成，蒙古文元音分隔符参与分词。
 */
const SENSITIVE_RE =
    /[\u180E\u200E\u200F\u202A-\u202E\u2060-\u206E\u3164\uFEFF]|[\u{E0100}-\u{E01EF}]/gu;

const LABELS: Record<string, string> = {
    '\u180E': 'U+180E 蒙古文元音分隔符',
    '\u200E': 'U+200E 从左到右标记',
    '\u200F': 'U+200F 从右到左标记',
    '\u202A': 'U+202A 从左到右嵌入',
    '\u202B': 'U+202B 从右到左嵌入',
    '\u202C': 'U+202C 嵌入结束',
    '\u202D': 'U+202D 从左到右覆盖',
    '\u202E': 'U+202E 从右到左覆盖',
    '\u2060': 'U+2060 词连接符',
    '\u2061': 'U+2061 函数应用符',
    '\u2062': 'U+2062 不可见乘号',
    '\u2063': 'U+2063 不可见分隔符',
    '\u2064': 'U+2064 不可见加号',
    '\u2066': 'U+2066 从左到右隔离',
    '\u2067': 'U+2067 从右到左隔离',
    '\u2068': 'U+2068 首强隔离',
    '\u2069': 'U+2069 隔离结束',
    '\u3164': 'U+3164 谚文填充符',
    '\uFEFF': 'U+FEFF 零宽不换行空格',
};

const bump = (map: Map<string, number>, key: string, count = 1): void => {
    map.set(key, (map.get(key) ?? 0) + count);
};

const labelOf = (char: string): string =>
    LABELS[char] ?? `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

const formatCounts = (counts: Map<string, number>): string =>
    [...counts].map(([label, count]) => `${label}×${count}`).join('、');

/** 合并重叠区间 */
const mergeRanges = (ranges: [number, number][]): [number, number][] => {
    const merged: [number, number][] = [];
    for (const range of [...ranges].sort((a, b) => a[0] - b[0])) {
        const last = merged[merged.length - 1];
        if (last && range[0] <= last[1]) {
            last[1] = Math.max(last[1], range[1]);
        } else {
            merged.push([range[0], range[1]]);
        }
    }
    return merged;
};

/**
 * 找出不可改动的区间：注释、nowiki/pre/code 等字面量标签。
 * 未闭合的标签按 MediaWiki 的行为视为延续到文末。
 */
const findLiteralRanges = (text: string): [number, number][] => {
    const ranges: [number, number][] = [],
        stack: { name: string; start: number }[] = [];
    let commentStart: number | undefined;

    for (const match of text.matchAll(LITERAL_TAG_RE)) {
        const token = match[0],
            index = match.index ?? 0;
        if (token === '<!--') {
            commentStart ??= index;
            continue;
        }
        if (token === '-->') {
            if (commentStart !== undefined) {
                ranges.push([commentStart, index + token.length]);
                commentStart = undefined;
            }
            continue;
        }
        const name = (match[2] ?? '').toLowerCase();
        if (match[3] === '/') {
            continue;
        }
        if (match[1] !== '/') {
            stack.push({ name, start: index });
            continue;
        }
        const position = stack.findLastIndex(({ name: open }) => open === name),
            opened = position >= 0 ? stack.splice(position, 1)[0] : undefined;
        if (opened) {
            ranges.push([opened.start, index + token.length]);
        }
    }

    if (commentStart !== undefined) {
        ranges.push([commentStart, text.length]);
    }
    for (const { start } of stack) {
        ranges.push([start, text.length]);
    }
    return mergeRanges(ranges);
};

/** 逐字符清理单个非字面量区段 */
const cleanSegment = (segment: string, removed: Map<string, number>): string => {
    let out = '';
    for (let i = 0; i < segment.length; i++) {
        const char = segment[i] ?? '';
        if (char !== ZERO_WIDTH_SPACE) {
            out += char;
            continue;
        }
        const prev = segment[i - 1],
            next = segment[i + 1];
        // 1. 前一个字符是标记字符：写进了语法内部（如双花括号之间）
        // 2. 后一个字符是标记字符且位于行首：用于阻止标题、列表等行首语法（如行首零宽空格 + `==`）
        if (isMarkup(prev) || (isMarkup(next) && isLineStart(prev))) {
            out += char;
            continue;
        }
        bump(removed, 'U+200B');
    }
    return out;
};

/**
 * 移除不可见字符。
 * 只删除零宽空格与页首 BOM；其余码位一律保留，仅在 `kept` 中回报。
 */
const stripInvisible = (source: string): CleaningResult => {
    const removed = new Map<string, number>(),
        kept = new Map<string, number>();

    let body = source;
    if (body.startsWith(BYTE_ORDER_MARK)) {
        bump(removed, 'U+FEFF');
        body = body.slice(1);
    }

    let cleaned = '',
        cursor = 0;
    for (const [start, end] of findLiteralRanges(body)) {
        cleaned += cleanSegment(body.slice(cursor, start), removed) + body.slice(start, end);
        cursor = end;
    }
    cleaned += cleanSegment(body.slice(cursor), removed);

    for (const match of cleaned.matchAll(SENSITIVE_RE)) {
        bump(kept, labelOf(match[0]));
    }

    return { text: cleaned, removed, kept };
};

export { bump, formatCounts, stripInvisible };
export type { CleaningResult };
