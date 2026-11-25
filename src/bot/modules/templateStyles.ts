import Parser from 'wikiparser-node';
import { findTemplates } from '@/utils';

type AstNode = ReturnType<typeof Parser.parse>;
type AstChild = AstNode['childNodes'][number];

const STYLE_SELECTOR = 'ext[name=templatestyles]';
const MARKER_TEMPLATES = [
    'TemplateStyles',
    'templatestyles',
    'CSS',
    'Css',
    '模板样式',
    '模板样式表',
] as const;

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
 * 解析页面，并递归解析 `<includeonly>` 的内部文本
 * @param wikitext - 页面内容
 * @returns 解析根节点列表，第一个是页面本身，其余是 includeonly 的内部文本
 */
const parseWithIncludes = (wikitext: string): AstNode[] => {
    const roots: AstNode[] = [];

    const visit = (text: string): void => {
        const root = Parser.parse(text);
        roots.push(root);

        walk(root, node => {
            if (node.type === 'include') {
                const innerText = (node as Parser.IncludeToken).innerText;
                if (innerText) {
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
            if (src) {
                styles.add(src);
            }
        }
    }

    return [...styles];
};

/**
 * 判断页面是否已有 TemplateStyles 标记
 * @param wikitext - 页面内容
 * @returns 是否已有标记
 */
const hasTemplateStylesMarker = (wikitext: string): boolean =>
    parseWithIncludes(wikitext).some(root => findTemplates(root, ...MARKER_TEMPLATES).length > 0);

/**
 * 生成 TemplateStyles 标记
 * @param styles - 样式页名列表
 * @returns `{{TemplateStyles|样式1|样式2}}`
 */
const buildTemplateStyles = (styles: string[]): string => `{{TemplateStyles|${styles.join('|')}}}`;

/**
 * 在模板文档开头插入标记
 * @param doc - 文档内容
 * @param styles - 样式页名列表
 * @returns 修改后的文档内容
 */
const markTemplateStylesDoc = (doc: string, styles: string[]): string => {
    if (styles.length === 0 || hasTemplateStylesMarker(doc)) {
        return doc;
    }

    return `${buildTemplateStyles(styles)}\n${doc}`;
};

/**
 * 查找第一个 `<noinclude>` 开标签的结束位置
 * @param page - 页面内容
 * @returns 插入位置，没有找到时为 `undefined`
 */
const findNoincludeEnd = (page: string): number | undefined => {
    let end: number | undefined;

    walk(Parser.parse(page), node => {
        if (
            end === undefined &&
            node.type === 'noinclude' &&
            /^<noinclude\b/i.test((node as Parser.NoincludeToken).innerText ?? '')
        ) {
            end = node.getAbsoluteIndex() + node.toString().length;
        }
    });

    return end;
};

/**
 * 在模板页的 `<noinclude>` 中插入标记
 *
 * 没有 `<noinclude>` 时在页面末尾补充一个。
 * @param page - 模板页内容
 * @param styles - 样式页名列表
 * @returns 修改后的模板页内容
 */
const markTemplateStylesPage = (page: string, styles: string[]): string => {
    if (styles.length === 0 || hasTemplateStylesMarker(page)) {
        return page;
    }

    const marker = buildTemplateStyles(styles),
        end = findNoincludeEnd(page);

    if (end !== undefined) {
        const needsNewline = page[end] !== '\n';

        return `${page.slice(0, end)}${marker}${needsNewline ? '\n' : ''}${page.slice(end)}`;
    }

    const base = page.endsWith('\n') ? page : `${page}\n`;

    return `${base}<noinclude>${marker}</noinclude>\n`;
};

export {
    extractTemplateStyles,
    hasTemplateStylesMarker,
    markTemplateStylesDoc,
    markTemplateStylesPage,
};
