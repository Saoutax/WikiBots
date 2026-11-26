import type { z } from 'zod';
import { BaseApi } from '@/utils';
import { GetContent } from './getContent';

class GetJson extends BaseApi {
    #source = new GetContent(this.api);

    /**
     * 获取页面 JSON 内容，可选传入 Zod schema 进行运行时校验
     * @param title - 页面标题
     * @param schema - 可选的 Zod 校验模式
     * @returns 解析后的 JSON
     */
    get = async <T = object>(title: string, schema?: z.ZodType<T>): Promise<T> => {
        const { content } = await this.#source.get(title);
        const parsed: unknown = JSON.parse(content);
        return schema ? schema.parse(parsed) : (parsed as T);
    };
}

export { GetJson };
