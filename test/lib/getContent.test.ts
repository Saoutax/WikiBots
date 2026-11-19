import { describe, expect, it } from 'vitest';
import { GetContent } from '@/lib/getContent';
import { createApiStub } from '../helpers/api';

describe('GetContent', () => {
    it('返回页面内容与版本号', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: {
                query: {
                    pages: [{ title: 'Foo', revisions: [{ content: 'wikitext', revid: 42 }] }],
                },
            },
        });

        const { get } = new GetContent(api);
        const result = await get('Foo');

        expect(result).toEqual({ content: 'wikitext', revid: 42 });
        expect(post).toHaveBeenCalledWith({
            action: 'query',
            prop: 'revisions',
            rvprop: 'content|revid',
            titles: 'Foo',
        });
    });

    it('页面没有 revision 时抛出错误', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [{ title: 'Foo' }] } } });

        const { get } = new GetContent(api);

        await expect(get('Foo')).rejects.toThrow('Failed to get content of Foo.');
    });

    it('pages 为空时抛出错误', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [] } } });

        const { get } = new GetContent(api);

        await expect(get('Bar')).rejects.toThrow('Failed to get content of Bar.');
    });
});
