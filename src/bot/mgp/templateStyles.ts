import type { ApiQueryResponseWithResult, InfoPage } from 'types-mediawiki-response';
import type { MwApiParams } from 'wiki-saikou';
import { run, zhapi as api } from '@/api';
import { BotInstance } from '@/lib';
import type { PageContent } from '@/lib';
import { delay, splitAndJoin } from '@/utils';
import {
    extractTemplateStyles,
    findTemplateStylesMarker,
    keyOf,
    syncStylePageComment,
    syncTemplateStylesDoc,
    syncTemplateStylesPage,
} from '../modules';

const bot = new BotInstance(api);

const DRY_RUN = process.env.DRY_RUN === '1';
const SEARCH_QUERIES = [
    'insource:"TemplateStyles"',
    'insource:"{{CSS"',
    'insource:"{{模板样式"',
] as const;
const MANAGED_CSS_QUERY = 'insource:"/* for"';
const SKIP_SUBPAGE = /(?:^|\/)(?:doc|沙盒|sandbox|testcases|test)(?:\/|$)/iu;
const SANDBOX_SUBPAGE = /(?:^|\/)(?:沙盒|sandbox|testcases|test)(?:\/|$)/iu;
const REDIRECT_CONTENT = /^\s*#(?:REDIRECT|重定向)\b/iu;
const CSS_PAGE = /\.css$/iu;
const INFERRED_SUFFIXES = ['/styles.css', '/style.css'] as const;

const SUMMARIES = {
    add: '添加{{[[T:TemplateStyles|TemplateStyles]]}}标记',
    sync: '更新{{[[T:TemplateStyles|TemplateStyles]]}}标记',
    remove: '移除{{[[T:TemplateStyles|TemplateStyles]]}}标记',
    comment: '更新模板样式表使用情况',
} as const;

type Action = keyof typeof SUMMARIES;
type PageInfo = InfoPage;

interface EditStats {
    failed: string[];
    counts: Record<string, number>;
    skipped: number;
    planned: number;
    edited: number;
    edit: (title: string, text: string, baserevid: number, action: Action) => Promise<void>;
}

/**
 * 判断页面内容是否为重定向文本
 * @param content - 页面内容
 * @returns 是否为重定向
 */
const isRedirectContent = (content: string): boolean => REDIRECT_CONTENT.test(content);

/**
 * 批量查询页面是否存在、是否为重定向及最新版本号
 * @param titles - 页面标题列表
 * @returns 键为页面标题的页面信息
 */
const queryPageInfo = async (titles: string[]): Promise<Record<string, PageInfo>> => {
    const result: Record<string, PageInfo> = {};

    for (const group of splitAndJoin(titles)) {
        const { data } = await api.post<ApiQueryResponseWithResult>({
            action: 'query',
            prop: 'info',
            titles: group,
        });

        (data.query.pages ?? []).forEach(page => {
            if (page.title) {
                result[page.title] = page;
            }
        });
    }

    return result;
};

/**
 * 搜索一个关键词下的页面
 * @param query - 搜索表达式
 * @returns 页面标题列表
 */
const searchPages = async (query: string): Promise<string[]> => {
    const titles = new Set<string>();
    let sroffset: number | string = 0;

    for (;;) {
        const params: MwApiParams = {
                action: 'query',
                list: 'search',
                srsearch: query,
                srnamespace: '10',
                srlimit: 'max',
                srprop: '',
                ...(sroffset ? { sroffset } : {}),
            },
            { data } = await api.post<ApiQueryResponseWithResult>(params);

        (data.query.search ?? []).forEach(({ title }) => titles.add(title));

        if (!data.continue?.sroffset) {
            break;
        }

        sroffset = data.continue.sroffset;
    }

    return [...titles];
};

/**
 * 搜索含标记或标签的模板页
 * @returns 页面标题列表
 */
const searchCandidates = async (): Promise<string[]> => {
    const titles = new Set<string>();

    for (const query of SEARCH_QUERIES) {
        for (const title of await searchPages(query)) {
            if (!SKIP_SUBPAGE.test(title)) {
                titles.add(title);
            }
        }
    }

    return [...titles];
};

/**
 * 搜索带有受管注释的样式页，确保引用归零时也能清理旧注释
 * @returns 样式页标题列表
 */
const searchManagedStylePages = async (): Promise<string[]> => {
    const titles = await searchPages(MANAGED_CSS_QUERY);

    return titles.filter(title => CSS_PAGE.test(title)).map(title => keyOf(title));
};

/**
 * 判断文档页是否可用
 * @param info - 页面信息
 * @returns 页面存在且不是重定向
 */
const isUsableDoc = (info: PageInfo | undefined): boolean =>
    info !== undefined && !info.missing && !info.redirect;

/**
 * 推断裸标记自动匹配的样式页
 * @param title - 模板标题
 * @param existing - 已存在的样式页集合
 * @returns 推断出的样式页，没有时返回 `undefined`
 */
const inferStyle = (title: string, existing: Set<string>): string | undefined =>
    INFERRED_SUFFIXES.map(suffix => keyOf(`${title}${suffix}`)).find(key => existing.has(key));

/**
 * 判断裸标记的自动推断是否与实际标签一致
 * @param title - 模板标题
 * @param styles - 实际使用的样式页名列表
 * @param existing - 已存在的样式页集合
 * @returns 是否一致
 */
const isBareAccurate = (title: string, styles: string[], existing: Set<string>): boolean => {
    if (styles.length !== 1) {
        return false;
    }

    const inferred = inferStyle(title, existing);

    return inferred !== undefined && inferred === keyOf(styles[0]!);
};

/**
 * 创建编辑执行器并统计执行结果
 * @returns 统计对象与编辑函数
 */
const createEditStats = (): EditStats => {
    const stats: EditStats = {
        failed: [],
        counts: {},
        skipped: 0,
        planned: 0,
        edited: 0,
        edit: async (title, text, baserevid, action) => {
            if (DRY_RUN) {
                stats.planned++;
                console.log(`[dry-run] ${action} ${title}: ${text.split('\n')[0]}`);
                return;
            }

            try {
                await bot.edit({
                    title,
                    text,
                    baserevid,
                    summary: SUMMARIES[action],
                    tags: 'Bot',
                });
                stats.edited++;
                stats.counts[action] = (stats.counts[action] ?? 0) + 1;
                console.log(`√ ${title}`);
            } catch (error) {
                stats.failed.push(title);
                console.error(
                    `× ${title}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }

            await delay(1000);
        },
    };

    return stats;
};

/**
 * 同步模板页与文档页的 TemplateStyles 标记
 * @param pageContents - 模板页内容
 * @param docContents - 文档页内容
 * @param infos - 页面信息
 * @param existingStyles - 已存在的样式页集合
 * @param stats - 编辑统计与执行器
 */
const syncMarkers = async (
    pageContents: Record<string, PageContent>,
    docContents: Record<string, PageContent>,
    infos: Record<string, PageInfo>,
    existingStyles: Set<string>,
    stats: EditStats,
): Promise<void> => {
    for (const [title, { content, revid }] of Object.entries(pageContents)) {
        const styles = extractTemplateStyles(content),
            docTitle = `${title}/doc`,
            rawDoc = docContents[docTitle],
            docRedirect =
                Boolean(infos[docTitle]?.redirect) ||
                (rawDoc !== undefined && isRedirectContent(rawDoc.content)),
            doc = docRedirect ? undefined : rawDoc,
            pageMarker = findTemplateStylesMarker(content),
            target = doc && !pageMarker ? docTitle : title,
            text = target === docTitle ? (doc?.content ?? '') : content,
            baseRevid = target === docTitle ? (doc?.revid ?? revid) : revid,
            marker = target === docTitle ? findTemplateStylesMarker(text) : pageMarker;

        if (marker?.bare && isBareAccurate(title, styles, existingStyles)) {
            stats.skipped++;
            continue;
        }

        const next =
            target === docTitle
                ? syncTemplateStylesDoc(text, styles)
                : syncTemplateStylesPage(text, styles, {
                      allowDocContent: !doc && !docRedirect,
                  });

        if (next === text) {
            stats.skipped++;
            continue;
        }

        const action: Action = marker ? (styles.length === 0 ? 'remove' : 'sync') : 'add';

        await stats.edit(target, next, baseRevid, action);
    }
};

/**
 * 重验源模板的最新版本，刷新并发修改过的模板内容
 * @param pageContents - 模板页内容快照
 */
const refreshStaleTemplates = async (pageContents: Record<string, PageContent>): Promise<void> => {
    const latestInfos = await queryPageInfo(Object.keys(pageContents)),
        staleTitles = Object.entries(pageContents)
            .filter(([title, { revid }]) => {
                const latest = latestInfos[title]?.lastrevid;

                return latest !== undefined && latest !== revid;
            })
            .map(([title]) => title);

    if (staleTitles.length === 0) {
        return;
    }

    const refreshed = await bot.batchQuery(staleTitles);
    Object.assign(pageContents, refreshed);
};

/**
 * 同步样式页顶部的使用者注释
 * @param pageContents - 模板页内容
 * @param managedStylePages - 带有受管注释的样式页候选
 * @param stats - 编辑统计与执行器
 */
const syncStyleComments = async (
    pageContents: Record<string, PageContent>,
    managedStylePages: string[],
    stats: EditStats,
): Promise<void> => {
    await refreshStaleTemplates(pageContents);

    const styleUsers = new Map<string, Set<string>>();
    for (const key of managedStylePages) {
        styleUsers.set(key, new Set());
    }

    for (const [title, { content }] of Object.entries(pageContents)) {
        for (const src of extractTemplateStyles(content)) {
            const key = keyOf(src);

            if (!styleUsers.has(key)) {
                styleUsers.set(key, new Set());
            }

            styleUsers.get(key)!.add(title);
        }
    }

    const styleKeys = [...styleUsers.keys()],
        styleInfos = await queryPageInfo(styleKeys),
        stylePages = await bot.batchQuery(styleKeys);

    for (const [key, users] of styleUsers) {
        const page = stylePages[key];

        if (!page || styleInfos[key]?.redirect || isRedirectContent(page.content)) {
            continue;
        }

        const templates = [...users].filter(title => !SANDBOX_SUBPAGE.test(title)).sort(),
            next = syncStylePageComment(page.content, templates);

        if (next === page.content) {
            stats.skipped++;
            continue;
        }

        await stats.edit(key, next, page.revid, 'comment');
    }
};

(async () => {
    await run(
        { api, site: 'zh' },
        async () => {
            const [titles, managedStylePages] = await Promise.all([
                    searchCandidates(),
                    searchManagedStylePages(),
                ]),
                docTitles = titles.map(title => `${title}/doc`),
                infos = await queryPageInfo([...titles, ...docTitles]),
                pageContents = await bot.batchQuery(titles),
                docContents = await bot.batchQuery(
                    docTitles.filter(title => isUsableDoc(infos[title])),
                );

            const styleKeys = new Set<string>();
            for (const { content } of Object.values(pageContents)) {
                for (const src of extractTemplateStyles(content)) {
                    styleKeys.add(keyOf(src));
                }
            }

            const styleInfos = await queryPageInfo([...styleKeys]),
                existingStyles = new Set(
                    Object.entries(styleInfos)
                        .filter(([, info]) => !info.missing)
                        .map(([title]) => title),
                );

            const stats = createEditStats();
            await syncMarkers(pageContents, docContents, infos, existingStyles, stats);
            await syncStyleComments(pageContents, managedStylePages, stats);

            const detail = Object.entries(stats.counts)
                .map(([action, count]) => `${SUMMARIES[action as Action]} ${count}`)
                .join('，');

            console.log(
                DRY_RUN
                    ? `完成：候选 ${titles.length}，计划 ${stats.planned}，跳过 ${stats.skipped}，失败 ${stats.failed.length}。`
                    : `完成：候选 ${titles.length}，编辑 ${stats.edited}（${detail || '无'}），跳过 ${stats.skipped}，失败 ${stats.failed.length}。`,
            );

            if (stats.failed.length > 0) {
                throw new Error(`以下页面编辑失败：${stats.failed.join('、')}`);
            }
        },
        true,
    );
})();
