import type { QueryPage } from 'types-mediawiki-response';
import { BaseApi, createRateLimiter, splitAndJoin } from '@/utils';
import type { PageContent } from './types';

class BatchQuery extends BaseApi {
    /**
     * 批量获取页面内容
     * @param titles - 页面标题数组
     * @param size - 分组查询页面个数，默认为 500
     * @param limit - 并发数量，默认为 5
     * @param timeout - 限速时间窗口，默认为 3000 毫秒
     * @returns - 键为页面名，值为页面内容与版本号
     */
    query = async (
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
}

export { BatchQuery };
