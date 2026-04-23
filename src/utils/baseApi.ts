import type { MediaWikiApi } from 'wiki-saikou';

/**
 * 为 lib 提供统一 API 入口
 */
class BaseApi {
    constructor(protected api: MediaWikiApi) {}
}

export { BaseApi };
