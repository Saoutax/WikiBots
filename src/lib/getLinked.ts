import type { MwApiResponse } from 'wiki-saikou';
import { BaseApi, formatNamespace, splitAndJoin } from '@/utils';

interface Page {
    title: string;
    linkshere: {
        title: string;
    }[];
}

class GetLinked extends BaseApi {
    /**
     * 查询链入页面
     * @param titles - 页面标题或数组
     * @param namespace - 命名空间编号数组
     * @param redirect - 查询重定向设定
     * @param size - 分组大小，默认为 500
     * @returns 对象，键为页面名，值为链入页面数组
     */
    get = async (
        titles: string | string[],
        namespace: number[] = [],
        redirect: boolean = false,
        size: number = 500,
    ) => {
        const result: Record<string, string[]> = {},
            lhnamespace = formatNamespace(namespace);
        await Promise.all(
            splitAndJoin(Array.isArray(titles) ? titles : [titles], size).map(async group => {
                let lhcontinue;
                do {
                    const {
                        data,
                        data: {
                            query: { pages = [] },
                        },
                    } = (await this.api.post({
                        action: 'query',
                        prop: 'linkshere',
                        titles: group,
                        lhprop: 'title',
                        lhnamespace,
                        lhshow: redirect ? undefined : '!redirect',
                        lhlimit: 'max',
                        lhcontinue,
                    })) as MwApiResponse;
                    for (const page of pages as Page[]) {
                        result[page.title] ??= [];
                        if (!page.linkshere?.length) {
                            continue;
                        }
                        page.linkshere.forEach(({ title }) => {
                            result[page.title]?.push(title);
                        });
                    }
                    lhcontinue = data?.continue?.lhcontinue;
                } while (lhcontinue);
            }),
        );
        return result;
    };
}

export { GetLinked };
