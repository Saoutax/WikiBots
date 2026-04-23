import pLimit from 'p-limit';
import type { MwApiResponse } from 'wiki-saikou';
import { BaseApi, splitAndJoin } from '@/utils';

type Pages = {
    title: string;
    globalusage: [];
}[];

class CheckGlobalUsage extends BaseApi {
    /**
     * 检查页面是否存在全域使用
     * @param titles - 页面标题数组
     * @param size - 分组页面个数，默认为 500
     * @returns - 键为页面名，值为链入结果
     */
    check = async (titles: string[], size: number = 500, limit: number = 5) => {
        const result: Record<string, boolean> = {},
            plimit = pLimit(limit);

        await Promise.all(
            splitAndJoin(titles, size).map(group =>
                plimit(async () => {
                    let gucontinue;
                    do {
                        const {
                            data,
                            data: {
                                query: { pages },
                            },
                        } = (await this.api.post({
                            action: 'query',
                            prop: 'globalusage',
                            titles: group,
                            gulimit: 'max',
                            gucontinue,
                        })) as MwApiResponse;
                        (pages as Pages).forEach(({ title, globalusage }) => {
                            result[title] = globalusage?.length > 0;
                        });
                        gucontinue = data?.continue?.gucontinue;
                    } while (gucontinue);
                }),
            ),
        );

        return result;
    };
}

export { CheckGlobalUsage };
