import pMap from 'p-map';
import type { QueryPage } from 'types-mediawiki-response';
import { createRateLimiter } from '@/infra';
import { BaseApi } from './base';
import { formatNamespace } from './formatNamespace';
import { splitAndJoin } from './splitAndJoin';
import type { PageContent } from './types';

/**
 * 批量与列表查询操作
 */
class QueryOps extends BaseApi {
    /**
     * 批量获取页面内容
     * @param titles - 页面标题数组
     * @param size - 分组查询页面个数，默认为 500
     * @param limit - 并发数量，默认为 5
     * @param timeout - 限速时间窗口，默认为 3000 毫秒
     * @returns - 键为页面名，值为页面内容与版本号
     */
    batchQuery = async (
        titles: string[],
        size = 500,
        limit = 5,
        timeout = 3000,
    ): Promise<Record<string, PageContent>> => {
        const result: Record<string, PageContent> = {},
            groups = splitAndJoin(titles, size),
            limiter = createRateLimiter({
                concurrency: limit,
                interval: timeout,
                intervalCap: limit,
            });

        await limiter.map(groups, async group => {
            const pages = await this.queryPages<QueryPage<'revisions'>>({
                action: 'query',
                prop: 'revisions',
                rvprop: 'content|ids',
                titles: group,
            });
            pages.forEach(({ title, revisions }) => {
                const revision = revisions?.[0];
                if (title && revision?.content !== undefined && revision.revid !== undefined) {
                    result[title] = { content: revision.content, revid: revision.revid };
                }
            });
        });

        return result;
    };

    /**
     * 检查页面是否存在全域使用
     * @param titles - 页面标题数组
     * @param size - 分组页面个数，默认为 500
     * @param limit - 并发数量，默认为 5
     * @returns - 键为页面名，值为链入结果
     */
    checkGlobalUsage = async (
        titles: string[],
        size = 500,
        limit = 5,
    ): Promise<Record<string, boolean>> => {
        const result: Record<string, boolean> = {};

        await pMap(
            splitAndJoin(titles, size),
            async group => {
                let gucontinue: string | number | undefined;
                do {
                    const {
                        query: { pages = [] },
                        continue: cont,
                    } = await this.queryData<{ pages?: QueryPage<'globalusage'>[] }>({
                        action: 'query',
                        prop: 'globalusage',
                        titles: group,
                        gulimit: 'max',
                        gucontinue,
                    });
                    pages.forEach(({ title, globalusage }) => {
                        if (!title) {
                            return;
                        }
                        if (globalusage?.length) {
                            result[title] = true;
                        } else if (!(title in result)) {
                            result[title] = false;
                        }
                    });
                    gucontinue = cont?.gucontinue;
                } while (gucontinue);
            },
            { concurrency: limit },
        );

        return result;
    };

    /**
     * 查询嵌入页面
     * @param title - 页面标题
     * @param namespace - 命名空间编号数组
     * @param eifilterredir - 查询重定向设定
     * @returns 嵌入页面标题数组
     */
    getEmbedded = async (
        title: string,
        namespace: number[] = [],
        eifilterredir: 'all' | 'nonredirects' | 'redirects' = 'nonredirects',
    ): Promise<string[]> => {
        const result: string[] = [],
            einamespace = formatNamespace(namespace);

        let eicontinue: string | undefined;
        do {
            const {
                query: { embeddedin = [] },
                continue: cont,
            } = await this.queryData({
                action: 'query',
                list: 'embeddedin',
                eititle: title,
                einamespace,
                eifilterredir,
                eilimit: 'max',
                eicontinue,
            });
            embeddedin.forEach(page => {
                result.push(page.title);
            });
            eicontinue = cont?.eicontinue;
        } while (eicontinue);
        return result;
    };

    /**
     * 查询链入页面
     * @param titles - 页面标题或数组
     * @param namespace - 命名空间编号数组
     * @param redirect - 查询重定向设定
     * @param size - 分组大小，默认为 500
     * @param limit - 并发数量，默认为 5
     * @returns 对象，键为页面名，值为链入页面数组
     */
    getLinked = async (
        titles: string | string[],
        namespace: number[] = [],
        redirect = false,
        size = 500,
        limit = 5,
    ): Promise<Record<string, string[]>> => {
        const result: Record<string, string[]> = {},
            lhnamespace = formatNamespace(namespace);
        await pMap(
            splitAndJoin(Array.isArray(titles) ? titles : [titles], size),
            async group => {
                let lhcontinue: string | undefined;
                do {
                    const {
                        query: { pages = [] },
                        continue: cont,
                    } = await this.queryData<{ pages?: QueryPage<'linkshere'>[] }>({
                        action: 'query',
                        prop: 'linkshere',
                        titles: group,
                        lhprop: 'title',
                        lhnamespace,
                        lhshow: redirect ? undefined : '!redirect',
                        lhlimit: 'max',
                        lhcontinue,
                    });
                    for (const page of pages) {
                        if (!page.title) {
                            continue;
                        }
                        result[page.title] ??= [];
                        if (!page.linkshere?.length) {
                            continue;
                        }
                        page.linkshere.forEach(({ title }) => {
                            if (title) {
                                result[page.title!]?.push(title);
                            }
                        });
                    }
                    lhcontinue = cont?.lhcontinue;
                } while (lhcontinue);
            },
            { concurrency: limit },
        );
        return result;
    };

    /**
     * 查询分类成员
     * @param categories - 分类名或分类名数组
     * @param recursive - 是否递归查询子分类
     * @param type - 查询类型
     * @param namespace - 所查询命名空间
     * @returns - 分类下页面
     */
    queryCategory = async (
        categories: string | string[],
        recursive = false,
        type: ('page' | 'subcat' | 'file')[] = ['page', 'subcat', 'file'],
        namespace: number[] = [],
    ): Promise<string[]> => {
        const result: Set<string> = new Set(),
            visited: Set<string> = new Set(),
            cmtype = type.join('|'),
            cmnamespace = formatNamespace(namespace);

        const categoryArray = Array.isArray(categories) ? categories : [categories];

        for (const category of categoryArray) {
            await this.#queryCategory(category, visited, result, recursive, cmnamespace, cmtype);
        }

        return [...result];
    };

    #queryCategory = async (
        category: string,
        visited: Set<string>,
        results: Set<string>,
        recursive: boolean,
        cmnamespace: string,
        cmtype: string,
    ) => {
        if (visited.has(category)) {
            return;
        }
        visited.add(category);

        let cmcontinue: string | undefined;
        do {
            const {
                query: { categorymembers = [] },
                continue: cont,
            } = await this.queryData({
                action: 'query',
                list: 'categorymembers',
                cmtitle: category,
                cmprop: 'title',
                cmnamespace,
                cmtype,
                cmcontinue,
                cmlimit: 'max',
            });
            for (const member of categorymembers) {
                if (!member.title) {
                    continue;
                }
                if (member.ns === 14 && recursive) {
                    await this.#queryCategory(
                        member.title,
                        visited,
                        results,
                        recursive,
                        cmnamespace,
                        cmtype,
                    );
                } else {
                    results.add(member.title);
                }
            }
            cmcontinue = cont?.cmcontinue;
        } while (cmcontinue);
    };
}

export { QueryOps };
