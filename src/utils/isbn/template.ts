import Parser, { type LinkToken, type Token, type TranscludeToken } from 'wikiparser-node';
import {
    canonicalIsbn10,
    ISBNError,
    isbnEquivalenceKey,
    isValidIsbn10,
    loadGroups,
    normaliseToken,
} from './core';
import type { ChangeReport, Group, TemplateNormaliseOptions, TemplatePreferences } from './types';

const SPECIAL_NAMESPACE_ALIASES = new Set(['special', '特殊']);
const BOOKSOURCE_PAGE_ALIASES = new Set([
    'booksources',
    '書籍來源',
    '網絡書源',
    '網路書源',
    '网络书源',
]);

/**
 * 创建空的改动统计
 * @returns 全零的 ChangeReport
 */
const createChangeReport = (): ChangeReport => ({
    booksourceLinks: 0,
    isbnNormalised: 0,
    isbn10Converted: 0,
    isbntMerged: 0,
    isbnReformatted: 0,
});

/**
 * 合并两份改动统计
 * @param a 改动统计
 * @param b 改动统计
 * @returns 合并后的改动统计
 */
const addChangeReport = (a: ChangeReport, b: ChangeReport): ChangeReport => ({
    booksourceLinks: a.booksourceLinks + b.booksourceLinks,
    isbnNormalised: a.isbnNormalised + b.isbnNormalised,
    isbn10Converted: a.isbn10Converted + b.isbn10Converted,
    isbntMerged: a.isbntMerged + b.isbntMerged,
    isbnReformatted: a.isbnReformatted + b.isbnReformatted,
});

/**
 * 改动总数（不含 isbnReformatted）
 * @param report 改动统计
 * @returns 前四项改动计数之和
 */
const changeReportTotal = (report: ChangeReport): number =>
    report.booksourceLinks + report.isbnNormalised + report.isbn10Converted + report.isbntMerged;

/** 默认模板名映射：canonical 片段 → 模板名 */
const DEFAULT_TEMPLATE_PREFERENCES: TemplatePreferences = {
    isbn: 'ISBN',
    isbnt: 'ISBNT',
    citebook: 'Cite book',
};

/**
 * 标题片段规范化：去空白与下划线并小写
 * @param value 原始标题片段
 * @returns 规范化后的片段
 */
const canonicaliseTitleFragment = (value: string): string =>
    value.trim().toLocaleLowerCase().replace(/[\s_]/g, '');

const TEMPLATE_NS = 'Template:';

/**
 * 取模板名并规范化（剥 Template: 前缀）
 * @param name wikiparser-node 模板名（含 Template: 前缀）
 * @returns 规范化后的片段
 */
const templateFragment = (name: string): string =>
    canonicaliseTitleFragment(name.startsWith(TEMPLATE_NS) ? name.slice(TEMPLATE_NS.length) : name);

/**
 * 判断是否为有效 ISBN-10（转换前）
 * @param raw 原始值
 * @returns 是否为有效 ISBN-10
 */
const isIsbn10Input = (raw: string): boolean => {
    const code10 = canonicalIsbn10(raw);
    return code10.length === 10 && isValidIsbn10(code10);
};

/**
 * 规范化模板参数值，非 ISBN 或无效时返回 null
 * @param rawValue 原始参数值
 * @param groups 号段分组
 * @param convert10To13 是否将 ISBN-10 转换为 ISBN-13
 * @returns 规范化结果；无效时返回 null
 */
const tryNormaliseTemplateValue = (
    rawValue: string,
    groups: readonly Group[],
    convert10To13: boolean,
): string | null => {
    try {
        return normaliseToken(rawValue, groups, convert10To13, false);
    } catch (error) {
        if (error instanceof ISBNError) {
            return null;
        }
        throw error;
    }
};

/**
 * 仅当值是有效 ISBN 时规范化，否则返回 null
 * @param rawValue 原始参数值
 * @param groups 号段分组
 * @param convert10To13 是否将 ISBN-10 转换为 ISBN-13
 * @returns 规范化结果；非有效 ISBN 返回 null
 */
const normaliseIfIsbn = (
    rawValue: string,
    groups: readonly Group[],
    convert10To13: boolean,
): string | null => {
    if (isbnEquivalenceKey(rawValue) === null) {
        return null;
    }
    return tryNormaliseTemplateValue(rawValue, groups, convert10To13);
};

/**
 * 判断两个 ISBN 语义是否等价
 * @param codeStr ISBN 字符串
 * @param outputLabel 另一个 ISBN 字符串或 null
 * @returns 是否语义等价
 */
const areSemanticallyEqualIsbns = (codeStr: string, outputLabel: string | null): boolean => {
    if (outputLabel === null) {
        return false;
    }
    const key1 = isbnEquivalenceKey(codeStr);
    const key2 = isbnEquivalenceKey(outputLabel);
    return key1 !== null && key1 === key2;
};

/**
 * 剥离 "ISBN " 前缀的 label，否则返回 null
 * @param label 显示文本
 * @returns 剥离前缀后的 ISBN 串；无 "ISBN " 前缀返回 null
 */
const splitIsbnPrefixedLabel = (label: string): string | null => {
    const text = label.trim();
    if (text.length <= 4) {
        return null;
    }
    if (text.slice(0, 4).toLocaleLowerCase() !== 'isbn') {
        return null;
    }
    const rest = text.slice(4);
    if (!rest || !/\s/.test(rest[0]!)) {
        return null;
    }
    const extracted = rest.trim();
    return extracted || null;
};

/**
 * 从 BookSources 链接标题中提取 ISBN，非该链接返回 null
 * @param title 链接目标标题（如 Special:网络书源/978...）
 * @returns ISBN 串；非 BookSources 链接返回 null
 */
const extractBookSourceIsbnFromTitle = (title: string): string | null => {
    let titleStr = title.trim();
    if (!titleStr) {
        return null;
    }
    if (titleStr.startsWith(':')) {
        titleStr = titleStr.slice(1).trim();
    }
    const slashIndex = titleStr.indexOf('/');
    if (slashIndex < 0) {
        return null;
    }
    const prefixText = titleStr.slice(0, slashIndex);
    const colonIndex = prefixText.indexOf(':');
    if (colonIndex < 0) {
        return null;
    }
    const namespace = canonicaliseTitleFragment(prefixText.slice(0, colonIndex));
    const pageName = canonicaliseTitleFragment(prefixText.slice(colonIndex + 1));
    if (!SPECIAL_NAMESPACE_ALIASES.has(namespace)) {
        return null;
    }
    if (!BOOKSOURCE_PAGE_ALIASES.has(pageName)) {
        return null;
    }
    const isbnText = titleStr.slice(slashIndex + 1).trim();
    return isbnText || null;
};

/**
 * 按参数名（不区分大小写）获取参数
 * @param template 模板节点
 * @param targetName 目标参数名
 * @returns 匹配的参数节点；不存在返回 undefined
 */
const getTemplateParamByName = (template: TranscludeToken, targetName: string) => {
    const target = targetName.trim().toLocaleLowerCase();
    if (!target) {
        return undefined;
    }
    return template.getAllArgs().find(param => param.name.trim().toLocaleLowerCase() === target);
};

/**
 * 获取并规范化模板参数 2（label），无参数或为空时返回 null
 * @param template 模板节点
 * @param groups 号段分组
 * @param convert10To13 是否将 ISBN-10 转换为 ISBN-13
 * @returns 规范化后的 label；无参数或为空返回 null
 */
const getTemplateLabelValue = (
    template: TranscludeToken,
    groups: readonly Group[],
    convert10To13: boolean,
): string | null => {
    if (!template.hasArg(2)) {
        return null;
    }
    const labelStr = template.getArg(2)!.getValue().trim();
    if (!labelStr) {
        return null;
    }
    const normalised = tryNormaliseTemplateValue(labelStr, groups, convert10To13);
    return normalised !== null ? normalised : labelStr;
};

/**
 * 移除模板参数（绕过 anonToNamed，保留其余匿名参数的匿名性）
 * @param template 模板节点
 * @param key 参数名（数字为匿名参数）
 */
const removeTemplateArg = (template: TranscludeToken, key: string | number): void => {
    const param = template.getArg(key);
    if (param !== undefined) {
        template.removeChild(param);
    }
};

/**
 * 更新模板参数 2（label），outputLabel 为 null 时移除该参数
 * @param template 模板节点
 * @param outputLabel 新的 label 值或 null
 */
const updateTemplateLabel = (template: TranscludeToken, outputLabel: string | null): void => {
    if (outputLabel === null) {
        removeTemplateArg(template, 2);
        return;
    }
    if (template.hasArg(2)) {
        template.getArg(2)!.setValue(outputLabel);
    } else {
        template.insertAt(template.newAnonArg(outputLabel));
    }
};

/**
 * 规范化 {{Cite book}} 模板的 isbn 参数
 * @param root 解析后的根节点
 * @param groups 号段分组
 * @param convert10To13 是否将 ISBN-10 转换为 ISBN-13
 * @param templateNameAliases 需处理的模板名 canonical 片段集合
 * @returns 改动统计
 */
const normaliseCiteBookIsbnTemplates = (
    root: Token,
    groups: readonly Group[],
    convert10To13: boolean,
    templateNameAliases: ReadonlySet<string>,
): ChangeReport => {
    const report = createChangeReport();
    for (const template of root.querySelectorAll<TranscludeToken>('template')) {
        if (!templateNameAliases.has(templateFragment(template.name))) {
            continue;
        }
        const isbnParam = getTemplateParamByName(template, 'isbn');
        if (isbnParam === undefined) {
            continue;
        }
        const rawValue = isbnParam.getValue().trim();
        if (!rawValue) {
            continue;
        }
        const normalisedValue = normaliseIfIsbn(rawValue, groups, convert10To13);
        if (normalisedValue === null || normalisedValue === rawValue) {
            continue;
        }
        isbnParam.setValue(normalisedValue);
        if (isbnParam.name.trim() !== 'isbn') {
            isbnParam.rename('isbn');
        }
        if (convert10To13 && isIsbn10Input(rawValue)) {
            report.isbn10Converted += 1;
        } else {
            report.isbnNormalised += 1;
        }
    }
    return report;
};

/**
 * 构造 {{模板名|code|label}} 模板节点
 * @param codeValue ISBN 代码
 * @param labelValue 显示文本或 null
 * @param templateName 模板名（如 ISBN、ISBNT）
 * @returns 模板节点
 * @throws 构造失败时抛 ISBNError
 */
const buildIsbnTemplateNode = (
    codeValue: string,
    labelValue: string | null,
    templateName: string,
): TranscludeToken => {
    const text =
        labelValue === null
            ? `{{${templateName}|${codeValue}}}`
            : `{{${templateName}|${codeValue}|${labelValue}}}`;
    const node = Parser.parse(text).querySelectorAll<TranscludeToken>('template')[0];
    if (node === undefined) {
        throw new ISBNError(`Failed to build ISBN template node from: ${text}`);
    }
    return node;
};

/**
 * 把 BookSources 链接替换为 ISBN 模板
 * @param root 解析后的根节点
 * @param groups 号段分组
 * @param convert10To13 是否将 ISBN-10 转换为 ISBN-13
 * @param templatePreferences 模板名映射
 * @returns 改动统计
 */
const replaceBookSourceLinksWithIsbnTemplates = (
    root: Token,
    groups: readonly Group[],
    convert10To13: boolean,
    templatePreferences: TemplatePreferences,
): ChangeReport => {
    const report = createChangeReport();
    for (const wikilink of root.querySelectorAll<LinkToken>('link')) {
        const linkIsbnRaw = extractBookSourceIsbnFromTitle(wikilink.link.title);
        if (linkIsbnRaw === null) {
            continue;
        }
        const normalisedLinkIsbn = normaliseIfIsbn(linkIsbnRaw, groups, convert10To13);
        if (normalisedLinkIsbn === null) {
            continue;
        }
        if (wikilink.length === 1) {
            continue;
        }
        const labelRaw = wikilink.innerText.trim();
        if (!labelRaw) {
            continue;
        }
        let valueReformatted = normalisedLinkIsbn !== linkIsbnRaw.trim();

        let preferredTemplate = templatePreferences['isbn'];
        if (preferredTemplate === undefined) {
            const firstValue = Object.values(templatePreferences)[0];
            preferredTemplate = firstValue ?? 'ISBN';
        }

        const labelIsbnRaw = splitIsbnPrefixedLabel(labelRaw);
        if (labelIsbnRaw !== null) {
            const labelIsbnNormalised = normaliseIfIsbn(labelIsbnRaw, groups, convert10To13);
            if (labelIsbnNormalised !== null) {
                valueReformatted = valueReformatted || labelIsbnNormalised !== labelIsbnRaw.trim();
            }
            if (
                labelIsbnNormalised !== null &&
                areSemanticallyEqualIsbns(linkIsbnRaw, labelIsbnRaw)
            ) {
                wikilink.replaceWith(
                    buildIsbnTemplateNode(normalisedLinkIsbn, null, preferredTemplate),
                );
            } else {
                wikilink.replaceWith(
                    buildIsbnTemplateNode(
                        normalisedLinkIsbn,
                        labelIsbnNormalised ?? labelRaw,
                        preferredTemplate,
                    ),
                );
            }
        } else {
            const labelIsbnNormalised = normaliseIfIsbn(labelRaw, groups, convert10To13);
            if (labelIsbnNormalised !== null) {
                valueReformatted = valueReformatted || labelIsbnNormalised !== labelRaw.trim();
            }
            wikilink.replaceWith(
                buildIsbnTemplateNode(
                    normalisedLinkIsbn,
                    labelIsbnNormalised ?? labelRaw,
                    preferredTemplate,
                ),
            );
        }

        report.booksourceLinks += 1;
        if (valueReformatted) {
            report.isbnReformatted += 1;
        }
    }
    return report;
};

/**
 * 规范化 wikitext 中的 ISBN 模板（已加载号段版本）
 * @param text wikitext 文本
 * @param groups 号段分组
 * @param options 规范化选项
 * @returns 规范化后的文本与改动统计
 */
const normaliseIsbnTemplatesWithGroups = (
    text: string,
    groups: readonly Group[],
    options: TemplateNormaliseOptions = {},
): { text: string; report: ChangeReport } => {
    const { convert10To13 = false, rehyphenateEqualLabel = false } = options;
    const templatePreferences = options.templatePreferences ?? DEFAULT_TEMPLATE_PREFERENCES;
    const templateNameAliases = new Set(Object.keys(templatePreferences));

    const root = Parser.parse(text);
    let report = createChangeReport();
    report = addChangeReport(
        report,
        normaliseCiteBookIsbnTemplates(root, groups, convert10To13, templateNameAliases),
    );
    report = addChangeReport(
        report,
        replaceBookSourceLinksWithIsbnTemplates(root, groups, convert10To13, templatePreferences),
    );

    for (const template of root.querySelectorAll<TranscludeToken>('template')) {
        if (!templateNameAliases.has(templateFragment(template.name))) {
            continue;
        }
        if (!template.hasArg(1)) {
            continue;
        }
        const param1 = template.getArg(1)!;
        const codeStr = param1.getValue().trim();
        const normalised1 = tryNormaliseTemplateValue(codeStr, groups, convert10To13);
        if (normalised1 === null) {
            continue;
        }
        const outputLabel = getTemplateLabelValue(template, groups, convert10To13);
        const equalIsbn = areSemanticallyEqualIsbns(codeStr, outputLabel);

        if (rehyphenateEqualLabel && equalIsbn) {
            const preferredIsbnt = templatePreferences['isbnt'];
            if (preferredIsbnt !== undefined) {
                template.replaceTemplate(preferredIsbnt);
            }
            if (normalised1 !== codeStr) {
                report.isbnReformatted += 1;
            }
            param1.setValue(normalised1);
            removeTemplateArg(template, 2);
            report.isbntMerged += 1;
            continue;
        }

        const originalCode = codeStr;
        const originalLabel = template.hasArg(2)
            ? (template.getArg(2)?.getValue().trim() ?? null)
            : null;

        if (normalised1 === originalCode && outputLabel === originalLabel) {
            continue;
        }

        param1.setValue(normalised1);
        updateTemplateLabel(template, outputLabel);

        if (convert10To13 && isIsbn10Input(originalCode)) {
            report.isbn10Converted += 1;
        } else {
            report.isbnNormalised += 1;
        }
    }

    return { text: root.toString(), report };
};

/**
 * 按号段文件规范化 wikitext 中的 ISBN 模板（便捷入口）
 * @param text wikitext 文本
 * @param xmlPath RangeMessage.xml 路径
 * @param options 规范化选项
 * @returns 规范化后的文本与改动统计
 */
const normaliseIsbnTemplates = async (
    text: string,
    xmlPath: string,
    options: TemplateNormaliseOptions = {},
): Promise<{ text: string; report: ChangeReport }> => {
    const groups = await loadGroups(xmlPath);
    return normaliseIsbnTemplatesWithGroups(text, groups, options);
};

export {
    addChangeReport,
    changeReportTotal,
    createChangeReport,
    DEFAULT_TEMPLATE_PREFERENCES,
    normaliseIsbnTemplates,
    normaliseIsbnTemplatesWithGroups,
};
