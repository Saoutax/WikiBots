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
const SKIP_SUBPAGE = /\/(?:doc|sandbox|testcases|test)$/i;
const SANDBOX_SUBPAGE = /(?:^|\/)(?:沙盒|sandbox|testcases|test)(?:\/|$)/i;
const INFERRED_SUFFIXES = ['/styles.css', '/style.css'] as const;

const SUMMARIES = {
    add: '添加{{[[T:TemplateStyles|TemplateStyles]]}}标记',
    sync: '更新{{[[T:TemplateStyles|TemplateStyles]]}}标记',
    remove: '移除{{[[T:TemplateStyles|TemplateStyles]]}}标记',
    comment: '更新模板样式表使用情况',
} as const;

type Action = keyof typeof SUMMARIES;

interface SearchResult {
    title: string;
}

interface SearchResponse {
    query: {
        search: SearchResult[];
    };
    continue?: {
        sroffset: number | string;
    };
}

interface PageInfo {
    title: string;
    missing?: boolean;
    redirect?: boolean;
}

/**
 * 批量查询页面是否存在、是否为重定向
 * @param titles - 页面标题列表
 * @returns 键为页面标题的页面信息
 */
const queryPageInfo = async (titles: string[]): Promise<Record<string, PageInfo>> => {
    const result: Record<string, PageInfo> = {};

    for (const group of splitAndJoin(titles)) {
        const { data } = await api.post<{ query: { pages: PageInfo[] } }>({
            action: 'query',
            prop: 'info',
            titles: group,
        });

        data.query.pages.forEach(page => {
            result[page.title] = page;
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
            { data } = await api.post<SearchResponse>(params);

        data.query.search.forEach(({ title }) => titles.add(title));

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

(async () => {
    await run({ api, site: 'zh' }, async () => {
        const titles = await searchCandidates(),
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

        const failed: string[] = [],
            counts: Record<string, number> = {};
        let skipped = 0,
            planned = 0,
            edited = 0;

        const edit = async (title: string, text: string, baserevid: number, action: Action) => {
            if (DRY_RUN) {
                planned++;
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
                edited++;
                counts[action] = (counts[action] ?? 0) + 1;
                console.log(`√ ${title}`);
            } catch (error) {
                failed.push(title);
                console.error(
                    `× ${title}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }

            await delay(1000);
        };

        for (const [title, { content, revid }] of Object.entries(pageContents)) {
            const styles = extractTemplateStyles(content),
                docTitle = `${title}/doc`,
                doc: PageContent | undefined = docContents[docTitle],
                docRedirect = Boolean(infos[docTitle]?.redirect),
                pageMarker = findTemplateStylesMarker(content),
                target = doc && !pageMarker ? docTitle : title,
                text = target === docTitle ? (doc?.content ?? '') : content,
                baseRevid = target === docTitle ? (doc?.revid ?? revid) : revid,
                marker = target === docTitle ? findTemplateStylesMarker(text) : pageMarker;

            if (marker?.bare && isBareAccurate(title, styles, existingStyles)) {
                skipped++;
                continue;
            }

            const next =
                target === docTitle
                    ? syncTemplateStylesDoc(text, styles)
                    : syncTemplateStylesPage(text, styles, {
                          allowDocContent: !doc && !docRedirect,
                      });

            if (next === text) {
                skipped++;
                continue;
            }

            const action: Action = marker ? (styles.length === 0 ? 'remove' : 'sync') : 'add';

            await edit(target, next, baseRevid, action);
        }

        const styleUsers = new Map<string, Set<string>>();
        for (const [title, { content }] of Object.entries(pageContents)) {
            for (const src of extractTemplateStyles(content)) {
                const key = keyOf(src);

                if (!styleUsers.has(key)) {
                    styleUsers.set(key, new Set());
                }

                styleUsers.get(key)!.add(title);
            }
        }

        const stylePages = await bot.batchQuery([...styleUsers.keys()]);

        for (const [key, users] of styleUsers) {
            const page = stylePages[key];

            if (!page || styleInfos[key]?.redirect) {
                continue;
            }

            const templates = [...users].filter(title => !SANDBOX_SUBPAGE.test(title)).sort(),
                next = syncStylePageComment(page.content, templates);

            if (next === page.content) {
                skipped++;
                continue;
            }

            await edit(key, next, page.revid, 'comment');
        }

        const detail = Object.entries(counts)
            .map(([action, count]) => `${SUMMARIES[action as Action]} ${count}`)
            .join('，');

        console.log(
            DRY_RUN
                ? `完成：候选 ${titles.length}，计划 ${planned}，跳过 ${skipped}，失败 ${failed.length}。`
                : `完成：候选 ${titles.length}，编辑 ${edited}（${detail || '无'}），跳过 ${skipped}，失败 ${failed.length}。`,
        );

        if (failed.length > 0) {
            throw new Error(`以下页面编辑失败：${failed.join('、')}`);
        }
    });
})();
