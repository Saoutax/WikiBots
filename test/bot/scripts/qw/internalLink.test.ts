import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtime } from '../../../helpers/bot';

const EDIT_SUMMARY = '机器人：移除已弃用模板';

interface PostParams {
    list?: string;
    prop?: string;
    titles?: string;
    eicontinue?: string;
}

interface FixturePage {
    title: string;
    revisions: { content: string; revid: number }[];
}

const stubPages = (pages: FixturePage[]) => ({ data: { query: { pages } } });

beforeEach(() => {
    vi.resetModules();
    runtime.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

it('分页查询 embeddedin，并把内部链接助手模板改写为内链', async () => {
    const stub = runtime.stubs['qw']!;

    stub.post.mockImplementation(async (params: PostParams) => {
        if (params.list === 'embeddedin') {
            if (params.eicontinue === 'next') {
                return { data: { query: { embeddedin: [{ title: 'Page B' }] } } };
            }

            return {
                data: {
                    query: { embeddedin: [{ title: 'Page A' }, { title: 'Page C' }] },
                    continue: { eicontinue: 'next' },
                },
            };
        }

        if (params.prop === 'revisions') {
            if (params.titles === 'Page_A|Page_C') {
                return stubPages([
                    { title: 'Page A', revisions: [{ content: 'A {{Le|Target}} B', revid: 11 }] },
                    { title: 'Page C', revisions: [{ content: '{{Other|x}}', revid: 13 }] },
                ]);
            }

            if (params.titles === 'Page_B') {
                return stubPages([
                    {
                        title: 'Page B',
                        revisions: [
                            {
                                content: '{{Internal_link_helper/en|Target||Display}}',
                                revid: 12,
                            },
                        ],
                    },
                ]);
            }
        }

        throw new Error(`Unexpected request: ${JSON.stringify(params)}`);
    });
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/internalLink');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    // 第一次不带 eicontinue，第二次带上一批的 eicontinue
    const embeddedinCalls = stub.post.mock.calls.filter(
        ([params]) => (params as PostParams).list === 'embeddedin',
    );
    expect(embeddedinCalls).toHaveLength(2);
    expect(embeddedinCalls[0]![0]).toEqual({
        action: 'query',
        list: 'embeddedin',
        eititle: 'Template:Internal_link_helper/en',
        einamespace: '0',
        eilimit: '500',
        eicontinue: undefined,
    });
    expect(embeddedinCalls[1]![0]).toEqual({
        action: 'query',
        list: 'embeddedin',
        eititle: 'Template:Internal_link_helper/en',
        einamespace: '0',
        eilimit: '500',
        eicontinue: 'next',
    });

    expect(stub.postWithToken).toHaveBeenCalledTimes(2);
    const [first, second] = stub.postWithToken.mock.calls;

    expect(first![0]).toBe('csrf');
    expect(first![1].title).toBe('Page A');
    expect(first![1].text).toBe('A [[Target]] B');
    expect(first![1].baserevid).toBe(11);
    expect(first![1].summary).toBe(EDIT_SUMMARY);
    expect(first![1].tags).toBeUndefined();
    expect(first![2]).toEqual({ retry: 10, noCache: true });

    expect(second![1].title).toBe('Page B');
    expect(second![1].text).toBe('[[Target|Display]]');
    expect(second![1].baserevid).toBe(12);

    // 无模板的 Page C 不被编辑
    expect(stub.postWithToken.mock.calls.map(([, body]) => body.title)).toEqual([
        'Page A',
        'Page B',
    ]);
    expect(console.log).toHaveBeenCalledWith('Done: Page A');
    expect(console.log).toHaveBeenCalledWith('Done: Page B');
});

it('页面没有内部链接助手模板时不编辑', async () => {
    const stub = runtime.stubs['qw']!;

    stub.post.mockImplementation(async (params: PostParams) => {
        if (params.list === 'embeddedin') {
            return { data: { query: { embeddedin: [{ title: 'Page D' }] } } };
        }

        if (params.prop === 'revisions') {
            return stubPages([
                {
                    title: 'Page D',
                    revisions: [{ content: '[[Target]] 与 {{Other|x}}', revid: 14 }],
                },
            ]);
        }

        throw new Error(`Unexpected request: ${JSON.stringify(params)}`);
    });

    await import('@/bot/qw/internalLink');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('Start next group.');
});
