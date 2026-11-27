import { describe, expect, it } from 'vitest';
import type { MwApiParams } from 'wiki-saikou';
import { QueryOps } from '@/lib/query';
import { createApiStub } from '../helpers/api';

describe('QueryOps', () => {
    it('单标题自动转为数组并返回链入页面', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: {
                query: { pages: [{ title: 'Foo', linkshere: [{ title: 'Bar' }] }] },
            },
        });

        const { getLinked: get } = new QueryOps(api);
        const result = await get('Foo');

        expect(post).toHaveBeenCalledTimes(1);
        expect(post.mock.calls[0]![0]).toEqual(
            expect.objectContaining({
                action: 'query',
                prop: 'linkshere',
                titles: 'Foo',
                lhprop: 'title',
                lhnamespace: '*',
                lhshow: '!redirect',
                lhlimit: 'max',
            }),
        );
        expect(result).toEqual({ Foo: ['Bar'] });
    });

    it('多标题合并为一次请求并分别返回链入页面', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: {
                query: {
                    pages: [
                        { title: 'Foo', linkshere: [{ title: 'A' }] },
                        { title: 'Bar', linkshere: [{ title: 'B' }, { title: 'C' }] },
                    ],
                },
            },
        });

        const { getLinked: get } = new QueryOps(api);
        const result = await get(['Foo', 'Bar']);

        expect(post.mock.calls[0]![0]).toEqual(expect.objectContaining({ titles: 'Foo|Bar' }));
        expect(result).toEqual({ Foo: ['A'], Bar: ['B', 'C'] });
    });

    it('lhcontinue 分页时合并多页结果', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValueOnce({
            data: {
                query: { pages: [{ title: 'Foo', linkshere: [{ title: 'A' }] }] },
                continue: { lhcontinue: 'next' },
            },
        });
        post.mockResolvedValueOnce({
            data: { query: { pages: [{ title: 'Foo', linkshere: [{ title: 'B' }] }] } },
        });

        const { getLinked: get } = new QueryOps(api);
        const result = await get('Foo');

        expect(result).toEqual({ Foo: ['A', 'B'] });
        expect(post).toHaveBeenCalledTimes(2);
        expect(post.mock.calls[0]![0]).toEqual(expect.objectContaining({ lhcontinue: undefined }));
        expect(post.mock.calls[1]![0]).toEqual(expect.objectContaining({ lhcontinue: 'next' }));
    });

    it('没有 linkshere 的页面得到空数组', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [{ title: 'Foo' }] } } });

        const { getLinked: get } = new QueryOps(api);

        expect(await get('Foo')).toEqual({ Foo: [] });
    });

    it('响应中没有 query.pages 时返回空对象', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: {} } });

        const { getLinked: get } = new QueryOps(api);

        expect(await get('Foo')).toEqual({});
    });

    it('redirect=false 时下发 lhshow=!redirect', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [] } } });

        const { getLinked: get } = new QueryOps(api);
        await get('Foo', [], false);

        const params = post.mock.calls[0]![0] as MwApiParams;
        expect(params.lhshow).toBe('!redirect');
    });

    it('redirect=true 时 lhshow 为 undefined', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [] } } });

        const { getLinked: get } = new QueryOps(api);
        await get('Foo', [], true);

        const params = post.mock.calls[0]![0] as MwApiParams;
        expect(params.lhshow).toBeUndefined();
    });

    it('命名空间经 formatNamespace 转换为 lhnamespace', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [] } } });

        const { getLinked: get } = new QueryOps(api);
        await get('Foo', [0, 4]);

        expect(post.mock.calls[0]![0]).toEqual(expect.objectContaining({ lhnamespace: '0|4' }));
    });

    it('默认命名空间参数为 *', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [] } } });

        const { getLinked: get } = new QueryOps(api);
        await get('Foo');

        expect(post.mock.calls[0]![0]).toEqual(expect.objectContaining({ lhnamespace: '*' }));
    });
});
