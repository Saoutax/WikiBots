import { describe, expect, it } from 'vitest';
import { PageOps } from '@/lib/page';
import { createApiStub } from '../helpers/api';

describe('PageOps', () => {
    it('pages 中带 missing 标记时返回 false', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [{ missing: true }] } } });

        const { checkExist: check } = new PageOps(api);
        const result = await check('Foo');

        expect(result).toBe(false);
        expect(post).toHaveBeenCalledWith({
            action: 'query',
            prop: 'info',
            titles: 'Foo',
        });
    });

    it('页面存在且没有 missing 标记时返回 true', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: { query: { pages: [{ title: 'Foo', pageid: 1 }] } },
        });

        const { checkExist: check } = new PageOps(api);

        expect(await check('Foo')).toBe(true);
    });

    it('pages 为空数组时返回 true', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [] } } });

        const { checkExist: check } = new PageOps(api);

        expect(await check('Foo')).toBe(true);
    });
});
