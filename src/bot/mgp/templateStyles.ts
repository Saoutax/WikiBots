import type { MwApiParams } from 'wiki-saikou';
import { run, zhapi as api } from '@/api';
import { BotInstance } from '@/lib';
import type { PageContent } from '@/lib';
import { delay, splitAndJoin } from '@/utils';
import { extractTemplateStyles, markTemplateStylesDoc, markTemplateStylesPage } from '../modules';

const bot = new BotInstance(api);

const DRY_RUN = process.env.DRY_RUN === '1';
const SEARCH_QUERY = 'insource:"<templatestyles"';
const SKIP_SUBPAGE = /\/(?:doc|sandbox|testcases|test)$/i;

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

interface Candidate {
    title: string;
    content: string;
    revid: number;
    styles: string[];
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
 * 搜索模板命名空间中带 `<templatestyles>` 标签的页面
 * @returns 页面标题列表
 */
const searchTemplates = async (): Promise<string[]> => {
    const titles = new Set<string>();
    let sroffset: number | string = 0;

    for (;;) {
        const params: MwApiParams = {
                action: 'query',
                list: 'search',
                srsearch: SEARCH_QUERY,
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

(async () => {
    await run({ api, site: 'zh' }, async () => {
        const titles = (await searchTemplates()).filter(title => !SKIP_SUBPAGE.test(title)),
            templateInfo = await queryPageInfo(titles),
            contentTitles = titles.filter(title => {
                const info = templateInfo[title];

                return info !== undefined && !info.missing && !info.redirect;
            }),
            pageContents = await bot.batchQuery(contentTitles),
            candidates: Candidate[] = [];

        for (const [title, { content, revid }] of Object.entries(pageContents)) {
            const styles = extractTemplateStyles(content);
            if (styles.length > 0) {
                candidates.push({ title, content, revid, styles });
            }
        }

        const docTitles = candidates.map(({ title }) => `${title}/doc`),
            docInfo = await queryPageInfo(docTitles),
            docContentTitles = docTitles.filter(title => {
                const info = docInfo[title];

                return info !== undefined && !info.missing && !info.redirect;
            }),
            docContents = await bot.batchQuery(docContentTitles),
            failed: string[] = [];
        let planned = 0,
            edited = 0,
            skipped = 0;

        const edit = async (title: string, text: string, baserevid: number) => {
            if (DRY_RUN) {
                planned++;
                console.log(`[dry-run] ${title}: ${text.split('\n')[0]}`);
                return;
            }

            try {
                await bot.edit({
                    title,
                    text,
                    baserevid,
                    summary: '添加{{TemplateStyles}}标记',
                    tags: 'Bot',
                });
                edited++;
                console.log(`√ ${title}`);
            } catch (error) {
                failed.push(title);
                console.error(
                    `× ${title}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }

            await delay(1000);
        };

        for (const { title, content, revid, styles } of candidates) {
            const docTitle = `${title}/doc`,
                info = docInfo[docTitle],
                doc: PageContent | undefined = docContents[docTitle];

            if (info?.redirect) {
                skipped++;
                continue;
            }

            if (doc) {
                const text = markTemplateStylesDoc(doc.content, styles);
                if (text === doc.content) {
                    skipped++;
                    continue;
                }

                await edit(docTitle, text, doc.revid);
            } else {
                const text = markTemplateStylesPage(content, styles);
                if (text === content) {
                    skipped++;
                    continue;
                }

                await edit(title, text, revid);
            }
        }

        console.log(
            DRY_RUN
                ? `完成：候选 ${candidates.length}，计划 ${planned}，跳过 ${skipped}，失败 ${failed.length}。`
                : `完成：候选 ${candidates.length}，编辑 ${edited}，跳过 ${skipped}，失败 ${failed.length}。`,
        );

        if (failed.length > 0) {
            throw new Error(`以下页面编辑失败：${failed.join('、')}`);
        }
    });
})();
