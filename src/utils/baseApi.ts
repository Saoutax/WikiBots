import type { MediaWikiApi, MwApiParams } from 'wiki-saikou';

/**
 * 为 lib 提供统一 API 入口
 */
class BaseApi {
    constructor(protected api: MediaWikiApi) {}

    /**
     * 发起 query 请求并返回响应数据
     * @param params - API 参数
     * @returns 响应中的 data 字段
     */
    protected async queryData<T>(params: MwApiParams) {
        const { data } = await this.api.post<{ query: T }>(params);
        return data;
    }

    /**
     * 发起 query 请求并返回页面列表
     * @param params - API 参数
     * @returns 响应中的 pages 数组
     */
    protected async queryPages<P>(params: MwApiParams) {
        const {
            query: { pages },
        } = await this.queryData<{ pages: P[] }>(params);
        return pages;
    }
}

export { BaseApi };
