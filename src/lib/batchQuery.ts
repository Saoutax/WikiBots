import pLimit from 'p-limit';
import { BaseApi, splitAndJoin } from '@/utils';

type Pages = {
    title: string;
    revisions: [
        {
            content: string;
        },
    ];
}[];

class BatchQuery extends BaseApi {
    /**
     * 批量获取页面内容
     * @param titles - 页面标题数组
     * @param size - 分组查询页面个数，默认为 500
     * @param limit - 并发数量，默认为 5
     * @param timeout - 延时，默认为 3000 毫秒
     * @returns - 键为页面名，值为页面内容或解析内容
     */
    query = async (
        titles: string[],
        size = 500,
        limit = 5,
        timeout = 3000,
    ): Promise<Record<string, string>> => {
        const result: Record<string, string> = {},
            plimit = pLimit(limit);

        await Promise.all(
            splitAndJoin(titles, size).map(group =>
                plimit(async () => {
                    const {
                        data: {
                            query: { pages },
                        },
                    } = await this.api.post({
                        action: 'query',
                        prop: 'revisions',
                        rvprop: 'content',
                        titles: group,
                    });
                    (pages as Pages).forEach(({ title, revisions = [] }) => {
                        const content = revisions?.[0]?.content;
                        if (content) {
                            result[title] = content;
                        }
                    });
                    await new Promise(resolve => {
                        setTimeout(resolve, timeout);
                    });
                }),
            ),
        );

        return result;
    };
}

export { BatchQuery };
