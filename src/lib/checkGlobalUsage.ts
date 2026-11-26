import pMap from 'p-map';
import type { QueryPage } from 'types-mediawiki-response';
import { BaseApi, splitAndJoin } from '@/utils';

class CheckGlobalUsage extends BaseApi {
    /**
     * 检查页面是否存在全域使用
     * @param titles - 页面标题数组
     * @param size - 分组页面个数，默认为 500
     * @param limit - 并发数量，默认为 5
     * @returns - 键为页面名，值为链入结果
     */
    check = async (titles: string[], size = 500, limit = 5): Promise<Record<string, boolean>> => {
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
}

export { CheckGlobalUsage };
