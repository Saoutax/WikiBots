import { BaseApi, splitAndJoin } from '@/utils';

type Info = { title: string; redirect?: boolean };

class CheckRedirect extends BaseApi {
    /**
     * 检查页面是否为重定向页面
     * @param titles - 页面标题数组
     * @param size - 分组页面个数，默认为 500
     * @returns - 键为页面名，值为重定向结果
     */
    check = async (titles: string[], size = 500) => {
        const result: Record<string, boolean> = {};

        await Promise.all(
            splitAndJoin(titles, size).map(async group => {
                const {
                    data: {
                        query: { pages },
                    },
                } = await this.api.post({
                    action: 'query',
                    prop: 'info',
                    titles: group,
                    formatversion: '2',
                });
                pages.forEach((page: Info) => {
                    result[page.title] = Object.hasOwn(page, 'redirect');
                });
            }),
        );

        return result;
    };
}

export { CheckRedirect };
