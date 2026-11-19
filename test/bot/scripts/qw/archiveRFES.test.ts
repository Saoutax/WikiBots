import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editedPage, runtime } from '../../../helpers/bot';

const TARGET = 'Qiuwen_talk:条目署名申请';
const ARCHIVE_TITLE = 'Qiuwen_talk:条目署名申请/存档/2026年';
const REVID = 202;

/** 存档页在本次运行前的完整内容（脚本只会向后追加） */
const ARCHIVE_PAGE_BEFORE =
    '{{talkarchive}}\n\n== 2025年 ==\n\n==== 早期申请 ====\n早期存档内容。\n';

/** 二级标题（含标题后换行）之前的前言，脚本原样保留并与正文之间加一个换行 */
const PREFACE = '本页用于申请条目署名权。\n\n== 条目署名申请 ==\n';

const ARCHIVED_REQUEST =
    '=== 申请一 ===\n{{Status|done}}\n申请理由一。2026年2月1日 12:00 (CST)\n\n';

const KEPT_REQUESTS =
    '=== 申请二 ===\n{{Status|oh}}\n申请理由二。2026年2月1日 12:00 (CST)\n\n' +
    '=== 申请三 ===\n{{Status|done}}\n申请理由三。2026年3月1日 12:00 (CST)\n';

const CONTENT = [
    '本页用于申请条目署名权。',
    '',
    '== 条目署名申请 ==',
    '',
    '=== 申请一 ===',
    '{{Status|done}}',
    '申请理由一。2026年2月1日 12:00 (CST)',
    '',
    '=== 申请二 ===',
    '{{Status|oh}}',
    '申请理由二。2026年2月1日 12:00 (CST)',
    '',
    '=== 申请三 ===',
    '{{Status|done}}',
    '申请理由三。2026年3月1日 12:00 (CST)',
    '',
].join('\n');

/** 申请一的状态不在白名单内，所有申请段都保留 */
const KEEP_CONTENT = CONTENT.replace(
    '=== 申请一 ===\n{{Status|done}}',
    '=== 申请一 ===\n{{Status|oh}}',
);

interface StubOptions {
    content: string;
    archiveExists?: boolean;
}

const configureStub = ({ content, archiveExists = false }: StubOptions) => {
    const stub = runtime.stubs['qw']!;

    stub.post.mockImplementation(async (params: { prop?: string; titles?: string }) => {
        if (params.prop === 'revisions') {
            return {
                data: {
                    query: {
                        pages: [{ title: params.titles, revisions: [{ content, revid: REVID }] }],
                    },
                },
            };
        }

        if (params.prop === 'info' && params.titles === ARCHIVE_TITLE) {
            return {
                data: {
                    query: {
                        pages: [
                            archiveExists
                                ? { title: ARCHIVE_TITLE }
                                : { title: ARCHIVE_TITLE, missing: true },
                        ],
                    },
                },
            };
        }

        throw new Error(`Unexpected request: ${JSON.stringify(params)}`);
    });

    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    return stub;
};

beforeEach(() => {
    vi.resetModules();
    runtime.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.useFakeTimers({ now: new Date('2026-03-02T00:00:00+08:00') });
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

it('归档状态在白名单内且已满 3 天的申请段', async () => {
    const stub = configureStub({ content: CONTENT });

    await import('@/bot/qw/archiveRFES');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const archiveCall = stub.postWithToken.mock.calls[0]!;
    expect(archiveCall[0]).toBe('csrf');
    expect(archiveCall[1].title).toBe(ARCHIVE_TITLE);
    expect(archiveCall[1].text).toBe(`{{talkarchive}}\n\n${ARCHIVED_REQUEST}`);
    expect(archiveCall[1].appendtext).toBeUndefined();
    expect(archiveCall[1].summary).toBe('机器人：存档讨论');
    expect(archiveCall[1].bot).toBe(true);
    expect(archiveCall[1].watchlist).toBe('nochange');
    expect(archiveCall[2]).toEqual({ retry: 10, noCache: true });
    // 存档页修改后的完整内容
    expect(editedPage(archiveCall[1])).toBe(`{{talkarchive}}\n\n${ARCHIVED_REQUEST}`);

    // 保留段按原顺序拼接，标题与正文之间只加一个换行
    const discussionCall = stub.postWithToken.mock.calls[1]!;
    expect(discussionCall[1].title).toBe(TARGET);
    expect(discussionCall[1].text).toBe(`${PREFACE}\n${KEPT_REQUESTS}`);
    expect(discussionCall[1].baserevid).toBe(REVID);
    expect(discussionCall[1].summary).toBe('机器人：存档讨论');
    expect(discussionCall[2]).toEqual({ retry: 10, noCache: true });

    expect(console.log).toHaveBeenCalledWith('Successfully archived.');
});

it('存档页已存在时追加到期内容而不是重建', async () => {
    const stub = configureStub({ content: CONTENT, archiveExists: true });

    await import('@/bot/qw/archiveRFES');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const archiveCall = stub.postWithToken.mock.calls[0]!;
    expect(archiveCall[1].title).toBe(ARCHIVE_TITLE);
    expect(archiveCall[1].appendtext).toBe(`\n\n${ARCHIVED_REQUEST}`);
    expect(archiveCall[1].text).toBeUndefined();
    // 存档页修改前后完整内容
    expect(editedPage(archiveCall[1], ARCHIVE_PAGE_BEFORE)).toBe(
        `${ARCHIVE_PAGE_BEFORE}\n\n${ARCHIVED_REQUEST}`,
    );

    const discussionCall = stub.postWithToken.mock.calls[1]!;
    expect(discussionCall[1].text).toBe(`${PREFACE}\n${KEPT_REQUESTS}`);
});

it('没有到期申请段时不编辑', async () => {
    const stub = configureStub({ content: KEEP_CONTENT });

    await import('@/bot/qw/archiveRFES');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(stub.post).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith('No threads need to be archived.');
});
