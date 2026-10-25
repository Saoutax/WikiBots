import pLimit from 'p-limit';
import { BaseApi, splitAndJoin, delay } from '@/utils';
import type { PageContent } from './types';

interface MWPage {
    title: string;
    revisions?: { content: string; revid: number }[];
}

class BatchQuery extends BaseApi {
    /**
     * 批量获取页面内容
     * @param titles - 页面标题数组
     * @param size - 分组查询页面个数，默认为 500
     * @param limit - 并发数量，默认为 5
     * @param timeout - 延时，默认为 3000 毫秒
     * @returns - 键为页面名，值为页面内容与版本号
     */
    query = async (
        titles: string[],
        size = 500,
        limit = 5,
        timeout = 3000,
    ): Promise<Record<string, PageContent>> => {
        const result: Record<string, PageContent> = {},
            plimit = pLimit(limit),
            groups = splitAndJoin(titles, size);

        await Promise.all(
            groups.map((group, index) =>
                plimit(async () => {
                    const pages = await this.queryPages<MWPage>({
                        action: 'query',
                        prop: 'revisions',
                        rvprop: 'content|revid',
                        titles: group,
                    });
                    pages.forEach(({ title, revisions }) => {
                        const revision = revisions?.[0];
                        if (revision) {
                            result[title] = { content: revision.content, revid: revision.revid };
                        }
                    });
                    if (index < groups.length - 1) {
                        await delay(timeout);
                    }
                }),
            ),
        );

        return result;
    };
}

export { BatchQuery };
