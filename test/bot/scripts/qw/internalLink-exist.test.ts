import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtime } from '../../../helpers/bot';

const CATEGORY = 'Category:有蓝链却未移除内部链接助手模板的页面';

interface PostParams {
    list?: string;
    prop?: string;
    titles?: string;
    cmtitle?: string;
}

interface StubOptions {
    page: string;
    content: string;
    revid: number;
}

const configureStub = ({ page, content, revid }: StubOptions) => {
    const stub = runtime.stubs['qw']!;

    stub.post.mockImplementation(async (params: PostParams) => {
        if (params.list === 'categorymembers') {
            return { data: { query: { categorymembers: [{ ns: 0, title: page }] } } };
        }

        if (params.prop === 'revisions') {
            return {
                data: {
                    query: {
                        pages: [{ title: page, revisions: [{ content, revid }] }],
                    },
                },
            };
        }

        throw new Error(`Unexpected request: ${JSON.stringify(params)}`);
    });
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    return stub;
};

beforeEach(() => {
    vi.resetModules();
    runtime.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

it('正文没有内部链接助手模板时执行零编辑', async () => {
    const stub = configureStub({
        page: 'Page A',
        content: '正文没有模板，仅有 [[目标]] 链接。',
        revid: 31,
    });

    await import('@/bot/qw/internalLink-exist');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    // 查询分类成员后批量读取正文
    expect(stub.post).toHaveBeenCalledWith({
        action: 'query',
        list: 'categorymembers',
        cmtitle: CATEGORY,
        cmprop: 'title',
        cmnamespace: '*',
        cmtype: 'page',
        cmcontinue: undefined,
        cmlimit: 'max',
    });

    expect(stub.postWithToken).toHaveBeenCalledTimes(1);
    const [first] = stub.postWithToken.mock.calls;
    expect(first![0]).toBe('csrf');
    expect(first![1].title).toBe('Page A');
    expect(first![1].appendtext).toBe('');
    expect(first![1].text).toBeUndefined();
    expect(first![1].baserevid).toBe(31);
    expect(first![1].summary).toBe('机器人：零编辑');
    expect(first![2]).toEqual({ retry: 10, noCache: true });
    expect(console.log).toHaveBeenCalledWith('NULLEDIT: Page A');
});

it('替换 names 中的模板为内链，保留第三参数的显示文本', async () => {
    const stub = configureStub({
        page: 'Page B',
        content: '前 {{Ilh|目标}} 后 {{Ilh|目标||显示}} 尾',
        revid: 32,
    });

    await import('@/bot/qw/internalLink-exist');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(1);
    const [first] = stub.postWithToken.mock.calls;
    expect(first![1].title).toBe('Page B');
    expect(first![1].text).toBe('前 [[目标]] 后 [[目标|显示]] 尾');
    expect(first![1].appendtext).toBeUndefined();
    expect(first![1].baserevid).toBe(32);
    expect(first![1].summary).toBe('机器人：移除已弃用模板');
    expect(first![1].tags).toBeUndefined();
    expect(console.log).toHaveBeenCalledWith('REPLACED: Page B');
});

it('模板位于 nowiki 内时解析器不可见，只执行零编辑而不改写正文', async () => {
    const stub = configureStub({
        page: 'Page C',
        content: '<nowiki>{{Ilh|目标}}</nowiki>',
        revid: 33,
    });

    await import('@/bot/qw/internalLink-exist');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(1);
    const [first] = stub.postWithToken.mock.calls;
    expect(first![1].title).toBe('Page C');
    expect(first![1].appendtext).toBe('');
    expect(first![1].text).toBeUndefined();
    expect(first![1].baserevid).toBe(33);
    expect(first![1].summary).toBe('机器人：零编辑');
    expect(console.log).toHaveBeenCalledWith('NULLEDIT: Page C');
});
