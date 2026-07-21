import pLimit from 'p-limit';
import { BaseApi, splitAndJoin } from '@/utils';

interface MWPage {
    title: string;
    globalusage: [];
}

class CheckGlobalUsage extends BaseApi {
    /**
     * 检查页面是否存在全域使用
     * @param titles - 页面标题数组
     * @param size - 分组页面个数，默认为 500
     * @returns - 键为页面名，值为链入结果
     */
    check = async (titles: string[], size = 500, limit = 5) => {
        const result: Record<string, boolean> = {},
            plimit = pLimit(limit);

        await Promise.all(
            splitAndJoin(titles, size).map(group =>
                plimit(async () => {
                    let gucontinue: string | undefined;
                    do {
                        const {
                            data,
                            data: {
                                query: { pages },
                            },
                        } = await this.api.post<{ query: { pages: MWPage[] } }>({
                            action: 'query',
                            prop: 'globalusage',
                            titles: group,
                            gulimit: 'max',
                            gucontinue,
                        });
                        pages.forEach(({ title, globalusage }) => {
                            if (globalusage?.length) {
                                result[title] = true;
                            } else if (!(title in result)) {
                                result[title] = false;
                            }
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
