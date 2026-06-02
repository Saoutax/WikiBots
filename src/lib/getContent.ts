import { BaseApi } from '@/utils';

class GetContent extends BaseApi {
    /**
     * 获取页面内容
     * @param title 页面标题
     * @returns 返回页面内容
     */
    get = async (title: string): Promise<string> => {
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

        return content;
    };
}

export { GetContent };
