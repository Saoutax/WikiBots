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

export { deriveTalkPage, sameTitle };
