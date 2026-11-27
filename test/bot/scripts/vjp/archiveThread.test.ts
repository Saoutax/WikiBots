import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editedPage, runtime } from '../../../helpers/bot';

type MockFn = ReturnType<typeof vi.fn>;

interface EditStub {
    postWithToken: MockFn;
}

/** 取出 postWithToken 每次调用的请求体（忽略第一个 token 参数） */
const editBodies = (stub: EditStub): Record<string, unknown>[] =>
    stub.postWithToken.mock.calls.map(call => call[1] as Record<string, unknown>);

const useNow = (iso: string): void => {
    vi.useFakeTimers({ now: new Date(iso) });
};

const mockDiscussion = (content: string, revid: number): void => {
    const stub = runtime.stubs['vjp']!;

    stub.post.mockResolvedValue({
        data: {
            query: {
                pages: [{ title: 'Vocawiki:讨论版', revisions: [{ content, revid }] }],
            },
        },
    });
    stub.postWithToken.mockResolvedValue({ data: { result: 'Success' } });
};

/** 存档页在本次运行前的完整内容（脚本只会向后追加） */
const ARCHIVE_PAGE_BEFORE = '{{存档页顶}}\n\n== 2025年12月存档 ==\n早期存档内容。\n';

const discussionPage = [
    '== 已存档 ==',
    '讨论内容 2026年1月1日 12:00 (CST)',
    '{{Saved}}',
    '',
    '== 已解决待归档 ==',
    '内容 2026年1月1日 12:00 (CST)',
    '{{MarkAsResolved|time=20260101|status=done}}',
    '',
    '== 挂起 ==',
    '内容 2026年1月1日 12:00 (CST)',
    '{{MarkAsResolved|time=20260101|status=suspended}}',
    '',
    '== 长期无回复 ==',
    '内容 2025年12月20日 12:00 (CST)',
    '',
    '== 新近回复 ==',
    '内容 2026年1月4日 12:00 (CST)',
    '',
].join('\n');

const archivedBody = [
    '== 已解决待归档 ==',
    '内容 2026年1月1日 12:00 (CST)',
    '{{MarkAsResolved|time=20260101|status=done}}',
    '',
    '== 长期无回复 ==',
    '内容 2025年12月20日 12:00 (CST)',
    '',
    '',
].join('\n');

const discussionAfterArchive = [
    '== 已解决待归档 ==',
    '{{Saved|link=Vocawiki:讨论版/存档/2026年|title=已解决待归档}}',
    '',
    '== 挂起 ==',
    '内容 2026年1月1日 12:00 (CST)',
    '{{MarkAsResolved|time=20260101|status=suspended}}',
    '',
    '== 长期无回复 ==',
    '{{Saved|link=Vocawiki:讨论版/存档/2026年|title=长期无回复}}',
    '',
    '== 新近回复 ==',
    '内容 2026年1月4日 12:00 (CST)',
    '',
].join('\n');

beforeEach(() => {
    vi.resetModules();
    runtime.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

it('周一移除 Saved 讨论串，归档到期与超期的讨论串', async () => {
    useNow('2026-01-05T04:00:00.000Z');
    mockDiscussion(discussionPage, 42);

    await import('@/bot/vjp/archiveThread');
    const result = await runtime.drain();
    const stub = runtime.stubs['vjp']!;

    expect(result.errors).toEqual([]);
    expect(stub.post).toHaveBeenCalledWith({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content|ids',
        titles: 'Vocawiki:讨论版',
    });
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const [archiveEdit, discussionEdit] = editBodies(stub);
    expect(archiveEdit).toMatchObject({
        title: 'Vocawiki:讨论版/存档/2026年',
        appendtext: `\n\n${archivedBody}`,
        summary: '存档过期讨论串',
        tags: 'Bot',
    });
    expect(archiveEdit?.['text']).toBeUndefined();
    expect(archiveEdit?.['baserevid']).toBeUndefined();
    // 存档页修改前后：修改前内容 + 追加的到期讨论串
    expect(editedPage(archiveEdit!, ARCHIVE_PAGE_BEFORE)).toBe(
        `${ARCHIVE_PAGE_BEFORE}\n\n${archivedBody}`,
    );

    // 讨论页修改前后完整内容：discussionPage → discussionAfterArchive
    expect(discussionEdit).toMatchObject({
        title: 'Vocawiki:讨论版',
        text: discussionAfterArchive,
        baserevid: 42,
        summary: '存档过期讨论串',
        tags: 'Bot',
    });

    // ① {{Saved}} 讨论串在周一从讨论页移除，且不进入存档
    expect(discussionAfterArchive).not.toContain('已存档');
    expect(archivedBody).not.toContain('已存档');
    // ③ status=suspended 使用 10 天 offset，未到期时保留且不归档
    expect(discussionAfterArchive).toContain('{{MarkAsResolved|time=20260101|status=suspended}}');
    expect(archivedBody).not.toContain('status=suspended');
});

it('没有需要归档的讨论串时存档页追加空串，讨论页仍被编辑', async () => {
    useNow('2026-01-05T04:00:00.000Z');
    const content = '== 仅新近回复 ==\n内容 2026年1月4日 12:00 (CST)\n';
    mockDiscussion(content, 43);

    await import('@/bot/vjp/archiveThread');
    const result = await runtime.drain();
    const stub = runtime.stubs['vjp']!;

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const [archiveEdit, discussionEdit] = editBodies(stub);
    expect(archiveEdit).toMatchObject({
        title: 'Vocawiki:讨论版/存档/2026年',
        appendtext: '',
        summary: '存档过期讨论串',
        tags: 'Bot',
    });
    // 没有到期讨论串时存档页保持修改前的完整内容
    expect(editedPage(archiveEdit!, ARCHIVE_PAGE_BEFORE)).toBe(ARCHIVE_PAGE_BEFORE);
    expect(discussionEdit).toMatchObject({
        title: 'Vocawiki:讨论版',
        text: content,
        baserevid: 43,
        summary: '存档过期讨论串',
        tags: 'Bot',
    });
});

it('仅含 Movedto 模板的讨论串直接存档，含其他正文时保留', async () => {
    useNow('2026-01-05T04:00:00.000Z');
    const movedOnlyThread = [
        '== 已移动讨论 ==',
        '<!-- 注释不影响判定 -->',
        '{{Movedto|Vocawiki:其他页面|sign=User 2026年1月5日 10:00 (CST)}}',
        '',
    ].join('\n');
    const movedWithTextThread = [
        '== 含正文不直接存档 ==',
        '{{Movedto|Vocawiki:其他页面}}',
        '仍有补充说明 2026年1月5日 10:00 (CST)',
        '',
    ].join('\n');

    mockDiscussion(movedOnlyThread + movedWithTextThread, 44);

    await import('@/bot/vjp/archiveThread');
    const result = await runtime.drain();
    const stub = runtime.stubs['vjp']!;

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const [archiveEdit, discussionEdit] = editBodies(stub);
    expect(archiveEdit).toMatchObject({
        title: 'Vocawiki:讨论版/存档/2026年',
        appendtext: `\n\n${movedOnlyThread}`,
        summary: '存档过期讨论串',
        tags: 'Bot',
    });
    expect(editedPage(archiveEdit!, ARCHIVE_PAGE_BEFORE)).toBe(
        `${ARCHIVE_PAGE_BEFORE}\n\n${movedOnlyThread}`,
    );

    const expectedDiscussion = [
        '== 已移动讨论 ==',
        '{{Saved|link=Vocawiki:讨论版/存档/2026年|title=已移动讨论}}',
        '',
        movedWithTextThread,
    ].join('\n');
    expect(discussionEdit).toMatchObject({
        title: 'Vocawiki:讨论版',
        text: expectedDiscussion,
        baserevid: 44,
        summary: '存档过期讨论串',
        tags: 'Bot',
    });
});
