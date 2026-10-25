import { BaseApi } from '@/utils';
import { GetContent } from './getContent';

class GetJson extends BaseApi {
    #source = new GetContent(this.api);

    /**
     * 获取页面JSON内容
     * @param title - 页面标题
     * @returns 解析后的JSON
     */
    get = async <T = object>(title: string): Promise<T> => {
        const { content } = await this.#source.get(title);
        return JSON.parse(content) as T;
    };
}

export { GetJson };
