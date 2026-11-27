import Parser from 'wikiparser-node';
import { normalizeTemplateName, normalizeTitleKey } from '@/wikitext';

type AstNode = ReturnType<typeof Parser.parse>;
type AstChild = AstNode['childNodes'][number];

const STYLE_SELECTOR = 'ext[name=templatestyles]';
const MARKER_TEMPLATES = new Set(['templatestyles', 'css', '模板样式', '模板样式表']);
const DOC_TEMPLATES = new Set(['doc', 'documentation', '模板文件', '文档', '模板说明']);
const MANAGED_COMMENT =
    /^[ \t]*\/\*[ \t]*for[ \t]+(\[\[[^\]\n]+\]\](?:(?:[ \t]*[、,][ \t]*|[ \t]*)\[\[[^\]\n]+\]\])*)[ \t]*\*\//iu;
const TEMPLATE_LINK = /\[\[([^\]\n]+)\]\]/gu;
const INVALID_TITLE_CHARS = /[|{}[\]<>\n\r#]/u;

interface MarkerInfo {
    /** 标记模板节点 */
    node: Parser.TranscludeToken;
    /** 标记在原文中的起始位置 */
    index: number;
    /** 标记在原文中的长度 */
    length: number;
    /** 现有匿名参数，已去除空白项 */
    styles: string[];
    /** 是否没有匿名参数 */
    bare: boolean;
}

interface NoincludeRange {
    /** 开标签起始位置 */
    openIndex: number;
    /** 开标签结束位置 */
    openEnd: number;
    /** 闭标签起始位置，没有闭标签时为 `Infinity` */
    closeStart: number;
}

/**
 * 判断子节点是否为可继续遍历的元素节点
 * @param node - 子节点
 * @returns 是否为元素节点
 */
const isElement = (node: AstChild): node is AstNode => 'childNodes' in node;

/**
 * 遍历 AST 节点
 * @param node - 根节点
 * @param callback - 对每个节点执行的回调
 */
const walk = (node: AstNode, callback: (node: AstNode) => void): void => {
    callback(node);

    for (const child of node.childNodes) {
        if (isElement(child)) {
            walk(child, callback);
        }
    }
};

/**
 * 两个标题集合是否一致
 * @param a - 标题列表
 * @param b - 标题列表
 * @returns 集合是否一致
 */
const sameTitles = (a: string[], b: string[]): boolean => {
    const left = new Set(a.map(title => normalizeTitleKey(title))),
        right = new Set(b.map(title => normalizeTitleKey(title)));

    return left.size === right.size && [...left].every(title => right.has(title));
};

/**
 * 判断样式页标题是否安全有效
 * @param title - 样式页标题
 * @returns 是否不包含维基文本控制字符
 */
const isValidStyleTitle = (title: string): boolean => {
    const trimmed = title.trim();

    return trimmed.length > 0 && !INVALID_TITLE_CHARS.test(trimmed);
};

/**
 * 生成标记文本
 * @param styles - 样式页名列表
 * @param name - 模板名
 * @param extra - 附加的命名参数文本
 * @returns `{{TemplateStyles|样式1|样式2}}`
 */
const formatMarker = (styles: string[], name = 'TemplateStyles', extra = ''): string => {
    if (styles.some(style => !isValidStyleTitle(style))) {
        throw new Error('Invalid TemplateStyles source title');
    }

    return `{{${name}|${styles.join('|')}${extra}}}`;
};

/**
 * 按原有模板名与命名参数重写标记
 * @param marker - 标记信息
 * @param styles - 样式页名列表
 * @returns 新的标记文本
 */
const rebuildMarker = (marker: MarkerInfo, styles: string[]): string => {
    const name = marker.node.childNodes[0].toString(),
        extra = marker.node
            .getAllArgs()
            .filter(arg => !arg.anon)
            .map(arg => `|${arg.toString()}`)
            .join('');

    return formatMarker(styles, name, extra);
};

/**
 * 解析页面，并递归解析 `<includeonly>` 的内部文本
 * @param wikitext - 页面内容
 * @param included - 是否继续解析嵌入文本
 * @returns 解析根节点列表
 */
const parseWithIncludes = (wikitext: string, included = true): AstNode[] => {
    const roots: AstNode[] = [];

    const visit = (text: string): void => {
        const root = Parser.parse(text);
        roots.push(root);

        if (!included) {
            return;
        }

        walk(root, node => {
            if (node.type === 'include') {
                const innerText = (node as Parser.IncludeToken).innerText;
                if (typeof innerText === 'string' && innerText) {
                    visit(innerText);
                }
            }
        });
    };

    visit(wikitext);

    return roots;
};

/**
 * 提取页面调用的模板样式表
 * @param wikitext - 页面内容
 * @returns 样式页名列表，按标签出现顺序去重
 */
const extractTemplateStyles = (wikitext: string): string[] => {
    const styles = new Set<string>();

    for (const root of parseWithIncludes(wikitext)) {
        for (const token of root.querySelectorAll<Parser.ExtToken>(STYLE_SELECTOR)) {
            const src = token.getAttr('src')?.trim();
            if (src && isValidStyleTitle(src)) {
                styles.add(src);
            }
        }
    }

    return [...styles];
};

/**
 * 查找页面中的所有 TemplateStyles 标记
 * @param wikitext - 页面内容
 * @returns 所有标记信息列表
 */
const findTemplateStylesMarkers = (wikitext: string): MarkerInfo[] => {
    const root = Parser.parse(wikitext);

    return root
        .querySelectorAll<Parser.TranscludeToken>('template')
        .filter(token => MARKER_TEMPLATES.has(normalizeTemplateName(token.name)))
        .map(node => {
            const styles = node
                .getAnonArgs()
                .map(arg => arg.value.trim())
                .filter(Boolean);

            return {
                node,
                index: node.getAbsoluteIndex(),
                length: node.toString().length,
                styles,
                bare: styles.length === 0,
            };
        });
};

/**
 * 查找页面中的首个 TemplateStyles 标记
 * @param wikitext - 页面内容
 * @returns 第一个标记的信息，没有时返回 `undefined`
 */
const findTemplateStylesMarker = (wikitext: string): MarkerInfo | undefined =>
    findTemplateStylesMarkers(wikitext)[0];

/**
 * 在指定位置替换文本
 * @param text - 原文
 * @param index - 起始位置
 * @param length - 替换长度
 * @param next - 新文本
 * @returns 替换后的文本
 */
const splice = (text: string, index: number, length: number, next: string): string =>
    `${text.slice(0, index)}${next}${text.slice(index + length)}`;

/**
 * 删除标记并清理多余的空行
 * @param text - 原文
 * @param marker - 标记信息
 * @returns 删除后的文本
 */
const removeMarker = (text: string, marker: MarkerInfo): string => {
    const { index, length } = marker;
    let next = splice(text, index, length, '');

    const before = index === 0 ? '\n' : (next[index - 1] ?? '\n'),
        after = next[index];

    if (after === '\n' && (index === 0 || before === '\n' || before === '>')) {
        next = `${next.slice(0, index)}${next.slice(index + 1)}`;
    }

    return next;
};

/**
 * 按从后往前的顺序批量删除标记
 * @param text - 原文
 * @param markers - 标记信息列表（按起始位置升序）
 * @returns 删除后的文本
 */
const removeMarkers = (text: string, markers: MarkerInfo[]): string => {
    let next = text;

    for (let i = markers.length - 1; i >= 0; i--) {
        next = removeMarker(next, markers[i]!);
    }

    return next;
};

/**
 * 查找第一个 `<noinclude>` 的范围
 * @param root - 解析根节点
 * @returns 标签范围，没有开标签时返回 `undefined`
 */
const findNoinclude = (root: AstNode): NoincludeRange | undefined => {
    let range: NoincludeRange | undefined;

    walk(root, node => {
        if (node.type !== 'noinclude') {
            return;
        }

        const innerText = (node as Parser.NoincludeToken).innerText ?? '',
            index = node.getAbsoluteIndex();

        if (!range) {
            if (/^<noinclude\b/iu.test(innerText)) {
                range = {
                    openIndex: index,
                    openEnd: index + node.toString().length,
                    closeStart: Infinity,
                };
            }

            return;
        }

        if (
            range.closeStart === Infinity &&
            index > range.openIndex &&
            /^<\/noinclude/iu.test(innerText)
        ) {
            range.closeStart = index;
        }
    });

    return range;
};

/**
 * 查找 `<noinclude>` 内的文档模板
 * @param root - 解析根节点
 * @param range - `<noinclude>` 范围
 * @returns 文档模板节点，没有时返回 `undefined`
 */
const findDocTemplate = (
    root: AstNode,
    range: NoincludeRange,
): Parser.TranscludeToken | undefined =>
    root.querySelectorAll<Parser.TranscludeToken>('template').find(token => {
        const index = token.getAbsoluteIndex();

        return (
            DOC_TEMPLATES.has(normalizeTemplateName(token.name)) &&
            index > range.openIndex &&
            index < range.closeStart
        );
    });

/**
 * 把标记写入文档模板的 `content` 参数
 *
 * 文档模板带有位置参数（引用其它页面的文档）时返回 `undefined`，避免覆盖被引用的内容。
 * @param text - 原文
 * @param token - 文档模板节点
 * @param markerText - 标记文本
 * @returns 写入后的文本，无法写入时返回 `undefined`
 */
const insertIntoDoc = (
    text: string,
    token: Parser.TranscludeToken,
    markerText: string,
): string | undefined => {
    if (token.hasArg(1)) {
        return undefined;
    }

    const content = token.getArg('content');

    if (content) {
        const value = content.lastChild,
            index = value.getAbsoluteIndex(),
            valueText = value.toString(),
            inserted =
                valueText.trim() === ''
                    ? markerText
                    : `${markerText}\n${valueText.replace(/^\n+/u, '')}`;

        return splice(text, index, valueText.length, inserted);
    }

    const last = token.lastChild,
        index = last.getAbsoluteIndex() + last.toString().length;

    return splice(text, index, 0, `|content=${markerText}`);
};

/**
 * 把 `<noinclude>` 内的标记移进文档模板的 `content`
 * @param text - 原文
 * @param marker - 标记信息
 * @param styles - 样式页名列表
 * @returns 移动后的文本，条件不满足时返回 `undefined`
 */
const moveIntoDoc = (text: string, marker: MarkerInfo, styles: string[]): string | undefined => {
    const root = Parser.parse(text),
        range = findNoinclude(root);

    if (!range) {
        return undefined;
    }

    const token = findDocTemplate(root, range);

    if (!token || marker.index > token.getAbsoluteIndex()) {
        return undefined;
    }

    const body = removeMarker(text, marker),
        bodyRoot = Parser.parse(body),
        bodyRange = findNoinclude(bodyRoot);

    if (!bodyRange) {
        return undefined;
    }

    const bodyToken = findDocTemplate(bodyRoot, bodyRange);

    if (!bodyToken) {
        return undefined;
    }

    return insertIntoDoc(body, bodyToken, rebuildMarker(marker, styles));
};

/**
 * 同步模板文档页的标记
 * @param doc - 文档内容
 * @param styles - 页面实际使用的样式页名列表
 * @returns 同步后的文档内容
 */
const syncTemplateStylesDoc = (doc: string, styles: string[]): string => {
    const markers = findTemplateStylesMarkers(doc),
        first = markers[0];

    if (!first) {
        return styles.length === 0 ? doc : `${formatMarker(styles)}\n${doc}`;
    }

    if (styles.length === 0) {
        return removeMarkers(doc, markers);
    }

    const next = removeMarkers(doc, markers.slice(1)),
        current = markers.length > 1 ? (findTemplateStylesMarker(next) ?? first) : first;

    if (sameTitles(current.styles, styles)) {
        return next;
    }

    return splice(next, current.index, current.length, rebuildMarker(current, styles));
};

/**
 * 同步模板页的标记
 *
 * 没有标记时优先写入 `<noinclude>` 内的文档模板，其次写入 `<noinclude>` 开头，
 * 两者都没有时在页尾补充一个 `<noinclude>`。
 * @param page - 模板页内容
 * @param styles - 页面实际使用的样式页名列表
 * @param options - 选项
 * @param options.allowDocContent - 是否允许写入文档模板的 `content`，默认为 `true`
 * @returns 同步后的模板页内容
 */
const syncTemplateStylesPage = (
    page: string,
    styles: string[],
    options: { allowDocContent?: boolean } = {},
): string => {
    const allowDocContent = options.allowDocContent ?? true,
        markers = findTemplateStylesMarkers(page),
        first = markers[0];

    if (first) {
        if (styles.length === 0) {
            return removeMarkers(page, markers);
        }

        const cleaned = removeMarkers(page, markers.slice(1)),
            current = markers.length > 1 ? (findTemplateStylesMarker(cleaned) ?? first) : first;

        if (!sameTitles(current.styles, styles)) {
            return splice(cleaned, current.index, current.length, rebuildMarker(current, styles));
        }

        return allowDocContent ? (moveIntoDoc(cleaned, current, styles) ?? cleaned) : cleaned;
    }

    if (styles.length === 0) {
        return page;
    }

    const markerText = formatMarker(styles),
        root = Parser.parse(page),
        range = findNoinclude(root);

    if (!range) {
        const base = page.endsWith('\n') ? page : `${page}\n`;

        return `${base}<noinclude>${markerText}</noinclude>\n`;
    }

    if (allowDocContent) {
        const token = findDocTemplate(root, range);

        if (token) {
            const inserted = insertIntoDoc(page, token, markerText);

            if (inserted !== undefined) {
                return inserted;
            }
        }
    }

    return splice(page, range.openEnd, 0, markerText + (page[range.openEnd] === '\n' ? '' : '\n'));
};

/**
 * 生成样式页顶部的使用说明注释
 * @param templates - 使用该样式页的模板标题
 * @returns 注释文本
 */
const formatStyleComment = (templates: string[]): string =>
    `/* for ${templates.map(title => `[[${title}]]`).join('、')} */`;

/**
 * 判断样式页开头是否已有提及模板的注释
 * @param css - 样式页内容
 * @returns 是否已有说明性注释
 */
const hasTemplateComment = (css: string): boolean => {
    const comment = /^\s*\/\*([^]*?)\*\//u.exec(css)?.[1] ?? '';

    if (!comment) {
        return false;
    }

    return (
        /\[\[(?:Template|模板|T):/iu.test(comment) ||
        /\{\{[^{}\n]*\}\}/u.test(comment) ||
        /(?:for|used by)\s*(?:\[\[|Template:|模板:)/iu.test(comment) ||
        /(?:使用|用于)\s*(?:\[\[|Template|模板)/iu.test(comment)
    );
};

/**
 * 同步样式页顶部的使用说明注释
 *
 * 只处理形如 `for [[Template:A]]` 的受管注释，其它人工注释保持原样。
 * @param css - 样式页内容
 * @param templates - 使用该样式页的模板标题
 * @returns 同步后的样式页内容
 */
const syncStylePageComment = (css: string, templates: string[]): string => {
    const list = [...new Set(templates)].sort(),
        managed = MANAGED_COMMENT.exec(css);

    if (managed) {
        const listed = [...(managed[1] ?? '').matchAll(TEMPLATE_LINK)].map(match =>
            match[1]!.trim(),
        );

        if (sameTitles(listed, list)) {
            return css;
        }

        if (list.length < 2) {
            const rest = css.slice(managed[0].length).replace(/^\n+/u, '');

            return rest.trim() === '' ? css : rest;
        }

        const rest = css.slice(managed[0].length);

        return rest.startsWith('\n')
            ? `${formatStyleComment(list)}${rest}`
            : `${formatStyleComment(list)}\n${rest}`;
    }

    if (hasTemplateComment(css) || list.length < 2) {
        return css;
    }

    return `${formatStyleComment(list)}\n${css}`;
};

export {
    extractTemplateStyles,
    findTemplateStylesMarker,
    syncStylePageComment,
    syncTemplateStylesDoc,
    syncTemplateStylesPage,
};
