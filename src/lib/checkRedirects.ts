import pMap from 'p-map';
import type { InfoPage } from 'types-mediawiki-response';
import { BaseApi, splitAndJoin } from '@/utils';

class CheckRedirects extends BaseApi {
    /**
     * 检查页面是否为重定向页面
     * @param titles - 页面标题数组
     * @param size - 分组页面个数，默认为 500
     * @param limit - 并发数量，默认为 5
     * @returns - 键为页面名，值为重定向结果
     */
    check = async (titles: string[], size = 500, limit = 5): Promise<Record<string, boolean>> => {
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
}

export { CheckRedirects };
