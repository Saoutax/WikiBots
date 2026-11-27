import { describe, expect, it } from 'vitest';
import { QueryOps } from '@/lib/query';
import { createApiStub } from '../helpers/api';

describe('QueryOps', () => {
    it('返回嵌入页面标题并使用默认参数', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: { query: { embeddedin: [{ title: 'P1' }] } },
        });

        const { getEmbedded: get } = new QueryOps(api);
        const result = await get('Foo');

        expect(result).toEqual(['P1']);
        expect(post.mock.calls[0]![0]).toEqual(
            expect.objectContaining({
                action: 'query',
                list: 'embeddedin',
                eititle: 'Foo',
                einamespace: '*',
                eifilterredir: 'nonredirects',
                eilimit: 'max',
                eicontinue: undefined,
            }),
        );
    });

    it('eicontinue 分页时合并多页结果', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValueOnce({
            data: {
                query: { embeddedin: [{ title: 'P1' }] },
                continue: { eicontinue: 'next' },
            },
        });
        post.mockResolvedValueOnce({
            data: { query: { embeddedin: [{ title: 'P2' }, { title: 'P3' }] } },
        });

        const { getEmbedded: get } = new QueryOps(api);
        const result = await get('Foo');

        expect(result).toEqual(['P1', 'P2', 'P3']);
        expect(post).toHaveBeenCalledTimes(2);
        expect(post.mock.calls[0]![0]).toEqual(expect.objectContaining({ eicontinue: undefined }));
        expect(post.mock.calls[1]![0]).toEqual(expect.objectContaining({ eicontinue: 'next' }));
    });

    it('无嵌入结果时返回空数组', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: {} } });

        const { getEmbedded: get } = new QueryOps(api);

        expect(await get('Foo')).toEqual([]);
    });

    it('嵌入结果为显式空数组时返回空数组', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { embeddedin: [] } } });

        const { getEmbedded: get } = new QueryOps(api);

        expect(await get('Foo')).toEqual([]);
    });

    it('自定义命名空间与 eifilterredir 透传给接口', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { embeddedin: [] } } });

        const { getEmbedded: get } = new QueryOps(api);
        await get('Foo', [0, 10], 'all');

        const params = post.mock.calls[0]![0];
        expect(params).toEqual(
            expect.objectContaining({ einamespace: '0|10', eifilterredir: 'all' }),
        );
    });
});
