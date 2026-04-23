import type { MwApiResponse } from 'wiki-saikou';
import { BaseApi, formatNamespace } from '@/utils';

interface Page {
    title: string;
}

class GetEmbedded extends BaseApi {
    /**
     * 查询嵌入页面
     * @param title - 页面标题
     * @param namespace - 命名空间编号数组
     * @param eifilterredir - 查询重定向设定
     * @returns 嵌入页面标题数组
     */
    get = async (
        title: string,
        namespace: number[] = [],
        eifilterredir: 'all' | 'nonredirects' | 'redirects' = 'nonredirects',
    ) => {
        const result: string[] = [],
            einamespace = formatNamespace(namespace);
        let eicontinue;
        do {
            const {
                data,
                data: {
                    query: { embeddedin = [] },
                },
            } = (await this.api.post({
                action: 'query',
                list: 'embeddedin',
                eititle: title,
                einamespace,
                eifilterredir,
                eilimit: 'max',
                eicontinue,
            })) as MwApiResponse;
            embeddedin.forEach((page: Page) => {
                result.push(page.title);
            });
            eicontinue = data?.continue?.eicontinue;
        } while (eicontinue);
        return result;
    };
}

export { GetEmbedded };
