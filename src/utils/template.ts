import Parser from 'wikiparser-node';

const TEMPLATE_PREFIX = 'template:';

/**
 * 规范化模板名
 *
 * @param name - 模板名
 * @returns 去掉 Template: 前缀、下划线转空格后的名称
 */
const normalizeTemplateName = (name: string): string => {
    const lower = name.toLowerCase();
    return (lower.startsWith(TEMPLATE_PREFIX) ? lower.slice(TEMPLATE_PREFIX.length) : lower)
        .replaceAll('_', ' ')
        .trim();
};

/**
 * 查找指定名称的模板
 *
 * @param root - 解析结果
 * @param names - 模板名
 * @returns 匹配的模板节点
 */
const findTemplates = (
    root: ReturnType<typeof Parser.parse>,
    ...names: string[]
): Parser.TranscludeToken[] => {
    const spec = new Set(names.map(normalizeTemplateName));
    return root
        .querySelectorAll<Parser.TranscludeToken>('template')
        .filter(({ name }) => spec.has(normalizeTemplateName(name)));
};

export { findTemplates, normalizeTemplateName };
