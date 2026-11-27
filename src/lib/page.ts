import pMap from 'p-map';
import type { InfoPage, QueryPage } from 'types-mediawiki-response';
import type { z } from 'zod';
import { BaseApi } from './base';
import { splitAndJoin } from './splitAndJoin';
import type { PageContent } from './types';

/**
 * 单页读取与存在性/重定向检查操作
 */
class PageOps extends BaseApi {
    /**
     * 检查是否存在目标页面
     * @param title 页面标题
     * @returns 检查结果
     */
    checkExist = async (title: string): Promise<boolean> => {
        const pages = await this.queryPages<InfoPage>({
            action: 'query',
            prop: 'info',
            titles: title,
        });
        return !pages[0]?.missing;
    };

    /**
     * 检查页面是否为重定向页面
     * @param titles - 页面标题数组
     * @param size - 分组页面个数，默认为 500
     * @param limit - 并发数量，默认为 5
     * @returns - 键为页面名，值为重定向结果
     */
    checkRedirect = async (
        titles: string[],
        size = 500,
        limit = 5,
    ): Promise<Record<string, boolean>> => {
        const result: Record<string, boolean> = {};

        await pMap(
            splitAndJoin(titles, size),
            async group => {
                const pages = await this.queryPages<InfoPage>({
                    action: 'query',
                    prop: 'info',
                    titles: group,
                });
                pages.forEach(page => {
                    if (page.title) {
                        result[page.title] = Object.hasOwn(page, 'redirect');
                    }
                });
            },
            { concurrency: limit },
        );

        return result;
    };

    /**
     * 获取页面内容与版本号
     * @param title - 页面标题
     * @returns 页面内容与版本号
     */
    getContent = async (title: string): Promise<PageContent> => {
        const pages = await this.queryPages<QueryPage<'revisions'>>({
            action: 'query',
            prop: 'revisions',
            rvprop: 'content|ids',
            titles: title,
        });
        const page = pages[0];
        const revision = page?.revisions?.[0];
        if (revision?.content === undefined || revision.revid === undefined) {
            throw new Error(`Failed to get content of ${title}: ${JSON.stringify(page ?? pages)}`);
        }
        return { content: revision.content, revid: revision.revid };
    };

    /**
     * 获取页面 JSON 内容，可选传入 Zod schema 进行运行时校验
     * @param title - 页面标题
     * @param schema - 可选的 Zod 校验模式
     * @returns 解析后的 JSON
     */
    getJson = async <T = object>(title: string, schema?: z.ZodType<T>): Promise<T> => {
        const { content } = await this.getContent(title);
        const parsed: unknown = JSON.parse(content);
        return schema ? schema.parse(parsed) : (parsed as T);
    };
}

export { PageOps };
