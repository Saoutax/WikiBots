import { describe, expect, it } from 'vitest';
import { z } from 'zod';
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

        await expect(get('Config')).rejects.toThrow('Failed to get content of Config: []');
    });

    it('传入 Zod schema 时校验合法结构并在结构不符时抛出 ZodError', async () => {
        const { api, post } = createApiStub();
        const schema = z.object({ a: z.number(), b: z.string() });
        const { get } = new GetJson(api);

        post.mockResolvedValueOnce({
            data: {
                query: {
                    pages: [
                        { title: 'Config', revisions: [{ content: '{"a":1,"b":"ok"}', revid: 7 }] },
                    ],
                },
            },
        });
        await expect(get('Config', schema)).resolves.toEqual({ a: 1, b: 'ok' });

        post.mockResolvedValueOnce({
            data: {
                query: {
                    pages: [{ title: 'Config', revisions: [{ content: '{"a":"bad"}', revid: 8 }] }],
                },
            },
        });
        await expect(get('Config', schema)).rejects.toThrow(z.ZodError);
    });
});
