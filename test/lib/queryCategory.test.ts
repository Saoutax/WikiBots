import { describe, expect, it } from 'vitest';
import { QueryOps } from '@/lib/query';
import { createApiStub } from '../helpers/api';

interface MWCategory {
    ns: number;
    title: string;
}

describe('QueryOps', () => {
    it('查询单个分类并使用默认参数', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: {
                query: {
                    categorymembers: [
                        { ns: 0, title: 'Page1' },
                        { ns: 14, title: 'Category:B' },
                    ],
                },
            },
        });

        const { queryCategory: query } = new QueryOps(api);
        const result = await query('Category:A');

        expect(result).toEqual(['Page1', 'Category:B']);
        expect(post.mock.calls[0]![0]).toEqual(
            expect.objectContaining({
                action: 'query',
                list: 'categorymembers',
                cmtitle: 'Category:A',
                cmprop: 'title',
                cmnamespace: '*',
                cmtype: 'page|subcat|file',
                cmlimit: 'max',
                cmcontinue: undefined,
            }),
        );
    });

    it('递归查询时下钻子分类并通过 visited 去重', async () => {
        const { api, post } = createApiStub();
        const members: Record<string, MWCategory[]> = {
            'Category:A': [
                { ns: 0, title: 'Page1' },
                { ns: 14, title: 'Category:B' },
            ],
            'Category:B': [
                { ns: 0, title: 'Page2' },
                { ns: 14, title: 'Category:A' },
            ],
        };
        post.mockImplementation(async (params: { cmtitle: string }) => ({
            data: { query: { categorymembers: members[params.cmtitle] ?? [] } },
        }));

        const { queryCategory: query } = new QueryOps(api);
        const result = await query('Category:A', true);

        expect(post).toHaveBeenCalledTimes(2);
        expect(post.mock.calls.map(call => (call[0] as { cmtitle: string }).cmtitle)).toEqual([
            'Category:A',
            'Category:B',
        ]);
        expect(result.sort()).toEqual(['Page1', 'Page2']);
    });

    it('cmcontinue 分页时合并多页结果', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValueOnce({
            data: {
                query: { categorymembers: [{ ns: 0, title: 'P1' }] },
                continue: { cmcontinue: 'next' },
            },
        });
        post.mockResolvedValueOnce({
            data: { query: { categorymembers: [{ ns: 0, title: 'P2' }] } },
        });

        const { queryCategory: query } = new QueryOps(api);
        const result = await query('Category:A');

        expect(result).toEqual(['P1', 'P2']);
        expect(post).toHaveBeenCalledTimes(2);
        expect(post.mock.calls[0]![0]).toEqual(expect.objectContaining({ cmcontinue: undefined }));
        expect(post.mock.calls[1]![0]).toEqual(expect.objectContaining({ cmcontinue: 'next' }));
    });

    it('多分类结果合并并去重', async () => {
        const { api, post } = createApiStub();
        post.mockImplementation(async (params: { cmtitle: string }) => ({
            data: {
                query: {
                    categorymembers:
                        params.cmtitle === 'Category:A'
                            ? [
                                  { ns: 0, title: 'P1' },
                                  { ns: 0, title: 'Shared' },
                              ]
                            : [
                                  { ns: 0, title: 'P2' },
                                  { ns: 0, title: 'Shared' },
                              ],
                },
            },
        }));

        const { queryCategory: query } = new QueryOps(api);
        const result = await query(['Category:A', 'Category:B']);

        expect(post).toHaveBeenCalledTimes(2);
        expect(result).toEqual(['P1', 'Shared', 'P2']);
    });

    it('命名空间与类型参数经格式化后透传', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { categorymembers: [] } } });

        const { queryCategory: query } = new QueryOps(api);
        await query('Category:A', false, ['page'], [0, 4]);

        expect(post.mock.calls[0]![0]).toEqual(
            expect.objectContaining({ cmnamespace: '0|4', cmtype: 'page' }),
        );
    });
});
