import { describe, expect, it } from 'vitest';
import type { MwApiParams } from 'wiki-saikou';
import { QueryOps } from '@/lib/query';
import { createApiStub } from '../helpers/api';
import type { MockFn } from '../helpers/api';

interface MWPage {
    title: string;
    revisions?: { content: string; revid: number }[];
}

const titlesOf = (post: MockFn) => post.mock.calls.map(call => (call[0] as MwApiParams).titles);

describe('QueryOps', () => {
    it('按 size 分组请求并返回页面内容与版本号', async () => {
        const { api, post } = createApiStub();
        post.mockImplementation(async (params: MwApiParams) => {
            const titles = params.titles as string;
            const pages: MWPage[] = titles.split('|').map(title => ({
                title,
                revisions: [{ content: `content-${title}`, revid: title.length }],
            }));
            return { data: { query: { pages } } };
        });

        const { batchQuery: query } = new QueryOps(api);
        const result = await query(['A', 'B'], 1, 1, 0);

        expect(post).toHaveBeenCalledTimes(2);
        expect(titlesOf(post)).toEqual(['A', 'B']);
        expect(post.mock.calls[0]![0]).toEqual(
            expect.objectContaining({
                action: 'query',
                prop: 'revisions',
                rvprop: 'content|ids',
                titles: 'A',
            }),
        );
        expect(result).toEqual({
            A: { content: 'content-A', revid: 1 },
            B: { content: 'content-B', revid: 1 },
        });
    });

    it('size=2 时每两个标题合并为一次请求', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [] } } });

        const { batchQuery: query } = new QueryOps(api);
        await query(['A', 'B', 'C'], 2, 1, 0);

        expect(post).toHaveBeenCalledTimes(2);
        expect(titlesOf(post)).toEqual(['A|B', 'C']);
    });

    it('跳过没有 revisions 的页面', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: {
                query: {
                    pages: [
                        { title: 'A' },
                        { title: 'B', revisions: [{ content: 'b', revid: 2 }] },
                    ],
                },
            },
        });

        const { batchQuery: query } = new QueryOps(api);
        const result = await query(['A', 'B'], 2, 1, 0);

        expect(result).toEqual({ B: { content: 'b', revid: 2 } });
    });

    it('空标题数组返回空对象且不发起请求', async () => {
        const { api, post } = createApiStub();

        const { batchQuery: query } = new QueryOps(api);
        const result = await query([], 500, 5, 0);

        expect(result).toEqual({});
        expect(post).not.toHaveBeenCalled();
    });

    it('组间延时使用 timeout=0 时不阻塞', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [] } } });

        const { batchQuery: query } = new QueryOps(api);
        const started = Date.now();
        await query(['A', 'B', 'C'], 1, 1, 0);
        const elapsed = Date.now() - started;

        expect(post).toHaveBeenCalledTimes(3);
        expect(elapsed).toBeLessThan(1000);
    });
});
