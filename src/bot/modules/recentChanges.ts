import type { ApiQueryResponseWithResult, ApiRecentChange } from 'types-mediawiki-response';
import type { MediaWikiApi, MwApiParams } from 'wiki-saikou';

/**
 * 分页遍历最近更改
 *
 * @param api - MediaWikiApi 实例
 * @param params - recentchanges 查询参数
 * @param collect - 每页数据的处理回调
 */
const collectRecentChanges = async <T = ApiRecentChange>(
    api: MediaWikiApi,
    params: MwApiParams,
    collect: (list: T[]) => void,
): Promise<void> => {
    let rccontinue: string | number | undefined;
    do {
        const { data } = await api.post<
            ApiQueryResponseWithResult & { query: { recentchanges?: T[] } }
        >({
            list: 'recentchanges',
            ...params,
            rccontinue,
        });
        const list = data?.query?.recentchanges;
        if (!list?.length) {
            break;
        }
        collect(list);
        rccontinue = data.continue?.rccontinue;
    } while (rccontinue);
};

export { collectRecentChanges };
