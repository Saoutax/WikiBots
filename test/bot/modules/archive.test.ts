import { describe, it, expect } from 'vitest';
import { archiveDiscussion } from '@/bot/modules/archive';
import { createApiStub, type ApiStub } from '../../helpers/api';

const target = 'Talk:测试页面',
    archiveTitle = 'Talk:测试页面/存档 1',
    discussion = '留在讨论页的内容',
    archive = '需要存档的内容',
    summary = '机器人存档';

const editBodyAt = (stub: ApiStub, index: number): Record<string, unknown> =>
    stub.postWithToken.mock.calls[index]?.[1] as Record<string, unknown>;

const mockArchiveExists = (stub: ApiStub, exists: boolean): void => {
    stub.post.mockResolvedValue({
        data: { query: { pages: [exists ? { pageid: 1 } : { missing: true }] } },
    });
    stub.postWithToken.mockResolvedValue({ data: { result: 'Success' } });
};

describe('archiveDiscussion', () => {
    it('存档页不存在时以 {{talkarchive}} 开头创建', async () => {
        const stub = createApiStub();
        mockArchiveExists(stub, false);

        await archiveDiscussion(stub.api, {
            target,
            archiveTitle,
            discussion,
            archive,
            summary,
        });

        expect(stub.post).toHaveBeenCalledWith({
            action: 'query',
            prop: 'info',
            titles: archiveTitle,
        });
        expect(stub.postWithToken).toHaveBeenCalledTimes(2);

        const archiveBody = editBodyAt(stub, 0);
        expect(archiveBody['title']).toBe(archiveTitle);
        expect(archiveBody['text']).toBe(`{{talkarchive}}\n\n${archive}`);
        expect((archiveBody['text'] as string).startsWith('{{talkarchive}}\n\n')).toBe(true);
        expect(archiveBody['summary']).toBe(summary);
        expect(archiveBody['appendtext']).toBeUndefined();
    });

    it('存档页已存在时追加内容', async () => {
        const stub = createApiStub();
        mockArchiveExists(stub, true);

        await archiveDiscussion(stub.api, {
            target,
            archiveTitle,
            discussion,
            archive,
            summary,
        });

        const archiveBody = editBodyAt(stub, 0);
        expect(archiveBody['appendtext']).toBe(`\n\n${archive}`);
        expect(archiveBody['title']).toBe(archiveTitle);
        expect(archiveBody['text']).toBeUndefined();

        const discussionBody = editBodyAt(stub, 1);
        expect(discussionBody['title']).toBe(target);
        expect(discussionBody['text']).toBe(discussion);
        expect(discussionBody['summary']).toBe(summary);
        expect(discussionBody['baserevid']).toBeUndefined();
    });

    it('传入 baserevid 时写入讨论页编辑参数', async () => {
        const stub = createApiStub();
        mockArchiveExists(stub, true);

        await archiveDiscussion(stub.api, {
            target,
            archiveTitle,
            discussion,
            archive,
            summary,
            baserevid: 12345,
        });

        const discussionBody = editBodyAt(stub, 1);
        expect(discussionBody['baserevid']).toBe(12345);
        expect(discussionBody['text']).toBe(discussion);
    });

    it('所有编辑都透传 summary', async () => {
        const stub = createApiStub();
        mockArchiveExists(stub, false);

        await archiveDiscussion(stub.api, {
            target,
            archiveTitle,
            discussion,
            archive,
            summary: '自定义摘要',
        });

        expect(editBodyAt(stub, 0)['summary']).toBe('自定义摘要');
        expect(editBodyAt(stub, 1)['summary']).toBe('自定义摘要');
    });
});
