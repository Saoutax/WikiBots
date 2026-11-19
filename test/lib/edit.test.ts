import { describe, expect, it } from 'vitest';
import { EditPage } from '@/lib/edit';
import { createApiStub } from '../helpers/api';

const bodyOf = (postWithToken: ReturnType<typeof createApiStub>['postWithToken']) =>
    postWithToken.mock.calls[0]![1] as Record<string, unknown>;

describe('EditPage', () => {
    it('默认下发 bot、watchlist 与 minor 参数并返回编辑响应', async () => {
        const { api, postWithToken } = createApiStub();
        const response = { data: { edit: { result: 'Success' } } };
        postWithToken.mockResolvedValue(response);

        const { edit } = new EditPage(api);
        const result = await edit({ title: 'Foo', summary: '摘要', text: '新内容' });

        expect(result).toBe(response);
        expect(postWithToken).toHaveBeenCalledWith(
            'csrf',
            expect.objectContaining({
                action: 'edit',
                title: 'Foo',
                summary: '摘要',
                text: '新内容',
                bot: true,
                watchlist: 'nochange',
                minor: true,
            }),
            { retry: 10, noCache: true },
        );
    });

    it('notminor 为 true 时不下发 minor', async () => {
        const { api, postWithToken } = createApiStub();
        postWithToken.mockResolvedValue({ data: {} });

        const { edit } = new EditPage(api);
        await edit({ title: 'Foo', summary: '摘要', text: '新内容', notminor: true });

        const body = bodyOf(postWithToken);
        expect(body).toEqual(expect.objectContaining({ notminor: true }));
        expect(Object.hasOwn(body, 'minor')).toBe(false);
    });

    it('显式 minor: false 时透传 false 且不下发 notminor', async () => {
        const { api, postWithToken } = createApiStub();
        postWithToken.mockResolvedValue({ data: {} });

        const { edit } = new EditPage(api);
        await edit({ title: 'Foo', summary: '摘要', text: '新内容', minor: false });

        const body = bodyOf(postWithToken);
        expect(body.minor).toBe(false);
        expect(Object.hasOwn(body, 'notminor')).toBe(false);
    });

    it('pageid 透传给接口', async () => {
        const { api, postWithToken } = createApiStub();
        postWithToken.mockResolvedValue({ data: {} });

        const { edit } = new EditPage(api);
        await edit({ pageid: 12345, summary: '摘要', text: '新内容' });

        const body = bodyOf(postWithToken);
        expect(body.pageid).toBe(12345);
        expect(body.title).toBeUndefined();
    });

    it('appendtext、section 等可选参数原样透传', async () => {
        const { api, postWithToken } = createApiStub();
        postWithToken.mockResolvedValue({ data: {} });

        const { edit } = new EditPage(api);
        await edit({
            title: 'Foo',
            summary: '摘要',
            appendtext: '追加内容',
            section: 'new',
            sectiontitle: '新章节',
            watchlist: 'watch',
            nocreate: true,
            baserevid: 99,
        });

        expect(bodyOf(postWithToken)).toEqual(
            expect.objectContaining({
                appendtext: '追加内容',
                section: 'new',
                sectiontitle: '新章节',
                watchlist: 'watch',
                nocreate: true,
                baserevid: 99,
            }),
        );
    });
});
