import type { MediaWikiApi } from 'wiki-saikou';
import Parser from 'wikiparser-node';
import { dayjs } from '@/infra';
import { BotInstance } from '@/lib';
import { getLatestTimestamp } from '@/wikitext';
import { archiveDiscussion } from './archive';

interface ListLink {
    /** 链接目标（不含 `#fragment`） */
    title: string;
    /** 命名空间编号 */
    ns: number;
}

interface ListEntry {
    /** 条目原文（含缩进回复） */
    text: string;
    /** 条目起始字符位置 */
    start: number;
    /** 条目结束字符位置（不含），包含行尾空白 */
    end: number;
    /** 提报行内的链接 */
    links: ListLink[];
}

interface ArchiveListParams {
    /** 讨论页标题 */
    target: string;
    /** 存档页标题 */
    archiveTitle: string;
    /** 从提报行解析被提报页面标题，`links` 为该行内的链接 */
    getReportedTitle: (firstLine: string, links: ListLink[]) => string | undefined;
    /** 存档所需的最少天数，默认为 3 */
    days?: number;
}

/**
 * 转换为链接目标
 *
 * @param link - 链接节点
 * @returns 链接目标与命名空间
 */
const toListLink = (link: Parser.LinkToken): ListLink => {
    const target = link.link;
    return typeof target === 'string'
        ? { title: target, ns: 0 }
        : { title: target.title, ns: target.ns };
};

/**
 * 是否为顶级列表行（单个 `*`），`*:`、`**` 等缩进列表行视为回复
 *
 * @param token - 节点
 * @returns 是否为顶级列表行
 */
const isTopLevelList = (token: { type: string; toString(): string }): boolean =>
    token.type === 'list' && token.toString().trimEnd() === '*';

/**
 * 解析扁平列表式提报页
 *
 * 使用 wikiparser-node 解析页面，顶级 `*` 行为一条提报，
 * `*:`、`**` 等后续列表行及其他缩进内容归入上一条提报。
 *
 * @param content - 页面内容
 * @returns 提报条目数组
 */
const parseListEntries = (content: string): ListEntry[] => {
    const children = Parser.parse(content).childNodes;
    const reports: { index: number; start: number; links: ListLink[] }[] = [];

    for (const [index, child] of children.entries()) {
        if (child.type !== 'list' || !isTopLevelList(child)) {
            continue;
        }

        const range = children[index + 1];
        const links = range?.is('list-range')
            ? range.querySelectorAll<Parser.LinkToken>('link').map(toListLink)
            : [];

        reports.push({ index, start: child.getAbsoluteIndex(), links });
    }

    return reports.map(({ index, start, links }) => {
        let end = content.length;

        for (let j = index + 1; j < children.length; j++) {
            const child = children[j]!;
            if (child.type === 'list' && isTopLevelList(child)) {
                end = child.getAbsoluteIndex();
                break;
            }
            if (child.type === 'list' || child.type === 'list-range') {
                continue;
            }
            if (child.type === 'comment' || (child.type === 'text' && child.text().trim() === '')) {
                continue;
            }
            end = child.getAbsoluteIndex();
            break;
        }

        const text = content.slice(start, end).trimEnd();
        return { text, start, end, links };
    });
};

/**
 * 移除指定提报条目
 *
 * @param content - 页面内容
 * @param entries - 需要移除的条目
 * @returns 移除后的内容
 */
const removeListEntries = (content: string, entries: ListEntry[]): string => {
    let result = content;

    for (const { start, end } of [...entries].sort((a, b) => b.start - a.start)) {
        result = result.slice(0, start) + result.slice(end);
    }

    return result;
};

/**
 * 存档扁平列表式提报页中目标已不存在的条目
 *
 * @param api - MediaWikiApi 实例
 * @param params - 存档参数
 */
const archiveList = async (
    api: MediaWikiApi,
    { target, archiveTitle, getReportedTitle, days = 3 }: ArchiveListParams,
): Promise<void> => {
    const bot = new BotInstance(api);
    const { content, revid } = await bot.getContent(target);
    const entries = parseListEntries(content);

    if (entries.length === 0) {
        console.log('No entries found.');
        return;
    }

    const currentTime = dayjs().tz();
    const archiveEntries: ListEntry[] = [];

    for (const entry of entries) {
        const firstLine = entry.text.split('\n')[0]!;
        const reported = getReportedTitle(firstLine, entry.links)?.trim();
        if (!reported) {
            console.log(`Skip entry without target: ${firstLine}`);
            continue;
        }

        const timestamp = getLatestTimestamp(entry.text);
        if (!timestamp || dayjs(currentTime).diff(timestamp, 'day') < days) {
            console.log(`Skip ${reported}: latest comment is less than ${days} days old.`);
            continue;
        }

        try {
            if (await bot.checkExist(reported)) {
                console.log(`Skip ${reported}: still exists.`);
                continue;
            }
        } catch (error) {
            console.log(`Skip ${reported}: failed to check: ${String(error)}`);
            continue;
        }

        console.log(`Archive ${reported}: target no longer exists.`);
        archiveEntries.push(entry);
    }

    if (archiveEntries.length === 0) {
        console.log('No entries need to be archived.');
        return;
    }

    const archive = archiveEntries
        .map(({ text }) => text)
        .join('\n')
        .trimEnd();
    const discussion = removeListEntries(content, archiveEntries);

    await archiveDiscussion(api, {
        target,
        archiveTitle,
        discussion,
        archive,
        summary: '机器人：存档讨论',
        baserevid: revid,
    });
    console.log(`Archived ${archiveEntries.length} entries.`);
};

export { archiveList, parseListEntries, removeListEntries };
export type { ArchiveListParams, ListEntry, ListLink };
