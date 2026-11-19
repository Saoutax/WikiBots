import { describe, expect, it } from 'vitest';
import type { MwApiParams } from 'wiki-saikou';
import { CheckRedirects } from '@/lib/checkRedirects';
import { createApiStub } from '../helpers/api';

describe('CheckRedirects', () => {
    it('页面带 redirect 属性时返回 true', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: { query: { pages: [{ title: 'Foo', redirect: true }] } },
        });

        const { check } = new CheckRedirects(api);
        const result = await check(['Foo']);

        expect(result).toEqual({ Foo: true });
        expect(post.mock.calls[0]![0]).toEqual(
            expect.objectContaining({ action: 'query', prop: 'info', titles: 'Foo' }),
        );
    });

    it('页面没有 redirect 属性时返回 false', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [{ title: 'Foo' }] } } });

        const { check } = new CheckRedirects(api);

        expect(await check(['Foo'])).toEqual({ Foo: false });
    });

    it('size=1 时每个标题各发起一次请求', async () => {
        const { api, post } = createApiStub();
        post.mockImplementation(async (params: MwApiParams) => {
            const title = params.titles as string;
            return {
                data: {
                    query: {
                        pages: title === 'A' ? [{ title, redirect: true }] : [{ title }],
                    },
                },
            };
        });

        const { check } = new CheckRedirects(api);
        const result = await check(['A', 'B'], 1);

        expect(post).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ A: true, B: false });
    });
});
