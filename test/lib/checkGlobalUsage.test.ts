import { describe, expect, it } from 'vitest';
import { QueryOps } from '@/lib/query';
import { createApiStub } from '../helpers/api';

interface MWPage {
    title: string;
    globalusage: { wiki: string; title: string }[];
}

describe('QueryOps', () => {
    it('globalusage 非空返回 true，为空返回 false', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: {
                query: {
                    pages: [
                        { title: 'File:A', globalusage: [{ wiki: 'x', title: 'A' }] },
                        { title: 'File:B', globalusage: [] },
                    ],
                },
            },
        });

        const { checkGlobalUsage: check } = new QueryOps(api);
        const result = await check(['File:A', 'File:B']);

        expect(result).toEqual({ 'File:A': true, 'File:B': false });
        expect(post.mock.calls[0]![0]).toEqual(
            expect.objectContaining({
                action: 'query',
                prop: 'globalusage',
                titles: 'File:A|File:B',
                gulimit: 'max',
                gucontinue: undefined,
            }),
        );
    });

    it('gucontinue 分页时后页 true 覆盖 false，且 true 不被后页 false 覆盖', async () => {
        const { api, post } = createApiStub();
        const firstPage: MWPage[] = [
            { title: 'File:A', globalusage: [] },
            { title: 'File:B', globalusage: [{ wiki: 'x', title: 'B' }] },
        ];
        const secondPage: MWPage[] = [
            { title: 'File:A', globalusage: [{ wiki: 'y', title: 'A' }] },
            { title: 'File:B', globalusage: [] },
        ];
        post.mockResolvedValueOnce({
            data: {
                query: { pages: firstPage },
                continue: { gucontinue: 'next' },
            },
        });
        post.mockResolvedValueOnce({ data: { query: { pages: secondPage } } });

        const { checkGlobalUsage: check } = new QueryOps(api);
        const result = await check(['File:A', 'File:B']);

        expect(result).toEqual({ 'File:A': true, 'File:B': true });
        expect(post).toHaveBeenCalledTimes(2);
        expect(post.mock.calls[0]![0]).toEqual(expect.objectContaining({ gucontinue: undefined }));
        expect(post.mock.calls[1]![0]).toEqual(expect.objectContaining({ gucontinue: 'next' }));
    });

    it('按 size 分组时每个分组各检查一次', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [] } } });

        const { checkGlobalUsage: check } = new QueryOps(api);
        await check(['File:A', 'File:B', 'File:C'], 2);

        expect(post).toHaveBeenCalledTimes(2);
    });
});
