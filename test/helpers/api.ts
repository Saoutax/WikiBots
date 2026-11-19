import { vi } from 'vitest';
import type { MediaWikiApi } from 'wiki-saikou';

type MockFn = ReturnType<typeof vi.fn>;

interface ApiStub {
    /** 可直接传给 BaseApi 子类、run、archiveDiscussion 等处的 API 实例 */
    api: MediaWikiApi;
    /** 对应 api.post，用于 query 类请求 */
    post: MockFn;
    /** 对应 api.postWithToken，用于编辑类请求 */
    postWithToken: MockFn;
    /** 对应 api.login，用于登录流程 */
    login: MockFn;
}

/**
 * 构建离线的 MediaWiki API stub。
 *
 * 测试中一律不发起真实请求，通过各 `vi.fn()` 的 `mockResolvedValue` /
 * `mockRejectedValue` 返回或模拟响应。
 */
const createApiStub = (): ApiStub => {
    const post = vi.fn();
    const postWithToken = vi.fn();
    const login = vi.fn();

    return {
        api: { post, postWithToken, login } as unknown as MediaWikiApi,
        post,
        postWithToken,
        login,
    };
};

export { createApiStub };
export type { ApiStub, MockFn };
