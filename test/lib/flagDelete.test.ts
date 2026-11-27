import { describe, expect, it } from 'vitest';
import { EditOps } from '@/lib/edit';
import { createApiStub } from '../helpers/api';

describe('EditOps', () => {
    it('仅将返回 newtimestamp 的页面计入结果', async () => {
        const { api, postWithToken } = createApiStub();
        postWithToken.mockImplementation(async (_token: string, body: { title: string }) => ({
            data: body.title === 'Good' ? { edit: { newtimestamp: '2026-01-01T00:00:00Z' } } : {},
        }));

        const { flagDelete: del } = new EditOps(api);
        const result = await del(['Good', 'Bad'], '理由', 'Admin');

        expect(result).toEqual(['Good']);
        expect(postWithToken).toHaveBeenCalledTimes(2);
    });

    it('挂删文本、摘要与编辑参数符合预期', async () => {
        const { api, postWithToken } = createApiStub();
        postWithToken.mockResolvedValue({
            data: { edit: { newtimestamp: '2026-01-01T00:00:00Z' } },
        });

        const { flagDelete: del } = new EditOps(api);
        await del(['Foo'], '侵权', 'Admin');

        const [token, body] = postWithToken.mock.calls[0]! as [string, Record<string, unknown>];
        expect(token).toBe('csrf');
        expect(body).toEqual(
            expect.objectContaining({
                action: 'edit',
                title: 'Foo',
                text: '<noinclude>{{即将删除|user=Admin|1=侵权}}</noinclude>',
                summary: '侵权',
                tags: 'Bot',
                bot: true,
                minor: true,
                nocreate: true,
            }),
        );
    });

    it('显式传入 summary 时覆盖默认理由', async () => {
        const { api, postWithToken } = createApiStub();
        postWithToken.mockResolvedValue({
            data: { edit: { newtimestamp: '2026-01-01T00:00:00Z' } },
        });

        const { flagDelete: del } = new EditOps(api);
        await del(['Foo'], '侵权', 'Admin', '自定义摘要');

        const body = postWithToken.mock.calls[0]![1] as Record<string, unknown>;
        expect(body.summary).toBe('自定义摘要');
    });

    it('编辑失败时不抛出且结果为空数组', async () => {
        const { api, postWithToken } = createApiStub();
        postWithToken.mockResolvedValue({ data: { edit: { result: 'Failure' } } });

        const { flagDelete: del } = new EditOps(api);

        expect(await del(['Foo'], '理由', 'Admin')).toEqual([]);
    });
});
