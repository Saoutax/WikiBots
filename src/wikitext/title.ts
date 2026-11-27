import Parser from 'wikiparser-node';

/**
 * 判断两个页面标题是否相同（忽略下划线与空格）
 *
 * @param a - 标题
 * @param b - 标题
 * @returns 是否相同
 */
const sameTitle = (a: string, b: string): boolean =>
    a.replaceAll('_', ' ').trim() === b.replaceAll('_', ' ').trim();

/**
 * 把页面标题归一化为可比较的完整标题（补全默认命名空间、统一空白）
 *
 * @param title - 页面标题
 * @param defaultNs - 没有命名空间前缀时的默认命名空间，默认 10（Template）
 * @returns 统一空白后的完整标题
 */
const normalizeTitleKey = (title: string, defaultNs = 10): string =>
    Parser.normalizeTitle(title, defaultNs).title.replaceAll('_', ' ').replace(/\s+/gu, ' ').trim();

/**
 * 由条目标题推导讨论页标题
 *
 * @param title - 条目或文件标题
 * @returns 讨论页标题
 */
const deriveTalkPage = (title: string): string | undefined => {
    const normalized = (title.startsWith(':') ? title.slice(1) : title).trim();

    if (!normalized) {
        return undefined;
    }

    try {
        const page = Parser.normalizeTitle(normalized, 0);
        return page.valid ? page.toTalkPage().title : undefined;
    } catch {
        return undefined;
    }
};

export { deriveTalkPage, normalizeTitleKey, sameTitle };
