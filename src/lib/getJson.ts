import { BaseApi } from '@/utils';

class GetJSON extends BaseApi {
    /**
     * 获取页面JSON内容
     * @param title 页面标题
     * @returns 返回解析后的JSON
     */
    get = async <T = any>(title: string) => {
        const {
            data: {
                query: {
                    pages: [
                        {
                            revisions: [{ content }],
                        },
                    ],
                },
            },
        } = await this.api.post({
            action: 'query',
            prop: 'revisions',
            rvprop: 'content',
            titles: title,
        });

        return JSON.parse(content) as T;
    };
}

export { GetJSON };
