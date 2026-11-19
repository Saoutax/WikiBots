import { describe, expect, it } from 'vitest';
import { GetJson } from '@/lib/getJson';
import { createApiStub } from '../helpers/api';

describe('GetJson', () => {
    it('解析页面中的合法 JSON', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: {
                query: {
                    pages: [
                        {
                            title: 'Config',
                            revisions: [{ content: '{"a":1,"b":"text"}', revid: 7 }],
                        },
                    ],
                },
            },
        });

        const { get } = new GetJson(api);
        const result = await get<{ a: number; b: string }>('Config');

        expect(result).toEqual({ a: 1, b: 'text' });
        expect(post).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'query', titles: 'Config' }),
        );
    });

    it('页面内容不是合法 JSON 时抛出 SyntaxError', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({
            data: {
                query: {
                    pages: [{ title: 'Config', revisions: [{ content: '{invalid', revid: 7 }] }],
                },
            },
        });

        const { get } = new GetJson(api);
        const thrown = await get('Config').catch((error: unknown) => error);

        expect(thrown).toBeInstanceOf(SyntaxError);
        expect(post).toHaveBeenCalledTimes(1);
    });

    it('内部通过 GetContent 请求内容，无内容时抛出 GetContent 的错误', async () => {
        const { api, post } = createApiStub();
        post.mockResolvedValue({ data: { query: { pages: [] } } });

        const { get } = new GetJson(api);

        await expect(get('Config')).rejects.toThrow('Failed to get content of Config.');
    });
});
