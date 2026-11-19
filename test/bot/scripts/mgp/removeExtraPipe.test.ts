import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runtime } from '../../../helpers/bot';

beforeEach(() => {
    vi.resetModules();
    runtime.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

it('去除同目标链接的多余管道符并写回', async () => {
    const stub = runtime.stubs['zh']!;

    stub.post.mockImplementation(async (params: { list?: string; prop?: string }) => {
        if (params.list === 'recentchanges') {
            return {
                data: { query: { recentchanges: [{ title: 'Page A' }, { title: 'Page B' }] } },
            };
        }

        if (params.prop === 'revisions') {
            return {
                data: {
                    query: {
                        pages: [
                            { title: 'Page A', revisions: [{ content: '[[Foo|Foo]]', revid: 7 }] },
                            {
                                title: 'Page B',
                                revisions: [{ content: '[[Bar]] [[Baz|Qux]]', revid: 8 }],
                            },
                        ],
                    },
                },
            };
        }

        throw new Error(`Unexpected request: ${JSON.stringify(params)}`);
    });
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/mgp/removeExtraPipe');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(1);
    expect(stub.postWithToken).toHaveBeenCalledWith(
        'csrf',
        expect.objectContaining({
            title: 'Page A',
            text: '[[Foo]]',
            baserevid: 7,
            summary: '移除多余管道符',
            tags: 'Bot',
        }),
        { retry: 10, noCache: true },
    );
    expect(result.updates).toEqual([['removeExtraPipe', expect.any(String)]]);
});

it('没有可修正的链接时不编辑，但仍更新时间记录', async () => {
    const stub = runtime.stubs['zh']!;

    stub.post.mockImplementation(async (params: { list?: string; prop?: string }) => {
        if (params.list === 'recentchanges') {
            return { data: { query: { recentchanges: [{ title: 'Page A' }] } } };
        }

        if (params.prop === 'revisions') {
            return {
                data: {
                    query: {
                        pages: [
                            {
                                title: 'Page A',
                                revisions: [
                                    {
                                        content: '[[Bar]] [[Baz|Qux]] [[Foo#frag|Foo]]',
                                        revid: 9,
                                    },
                                ],
                            },
                        ],
                    },
                },
            };
        }

        throw new Error(`Unexpected request: ${JSON.stringify(params)}`);
    });

    await import('@/bot/mgp/removeExtraPipe');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(result.updates).toEqual([['removeExtraPipe', expect.any(String)]]);
});
