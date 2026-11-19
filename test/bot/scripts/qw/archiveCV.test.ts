import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editedPage, runtime } from '../../../helpers/bot';

const TARGET = 'Qiuwen_talk:侵权提报';
const ARCHIVE_TITLE = 'Qiuwen_talk:侵权提报/存档/2026年';
const REVID = 101;

/** 存档页在本次运行前的完整内容（脚本只会向后追加） */
const ARCHIVE_PAGE_BEFORE = '{{talkarchive}}\n\n== 2026年1月 ==\n\n旧存档内容。\n';

const PREFACE = '本页用于提报侵权。\n\n';

/** 2026年2月区块：两条到期条目，整段可归档 */
const FEBRUARY_BLOCK =
    '== 2026年2月 ==\n\n' +
    '==== Page A ====\n{{CopyvioEntry|Page A}}\n提报理由。2026年2月1日 12:00 (CST)\n\n' +
    '==== Page B ====\n{{CopyvioEntry|Page B}}\n提报理由。2026年2月1日 12:00 (CST)';

const PAGE_A_ENTRY =
    '==== Page A ====\n{{CopyvioEntry|Page A}}\n提报理由。2026年2月1日 12:00 (CST)\n\n';

/** 2026年3月区块：签名时间不足 3 天，永远保留 */
const MARCH_SECTION =
    '== 2026年3月 ==\n\n==== Page C ====\n{{CopyvioEntry|Page C}}\n提报理由。2026年3月1日 12:00 (CST)\n';

const PAGE_B_KEPT =
    '==== Page B ====\n{{CopyvioEntry|Page B}}\n提报理由。2026年2月1日 12:00 (CST)\n\n';

const CONTENT =
    PREFACE +
    [
        '== 2026年2月 ==',
        '',
        '==== Page A ====',
        '{{CopyvioEntry|Page A}}',
        '提报理由。2026年2月1日 12:00 (CST)',
        '',
        '==== Page B ====',
        '{{CopyvioEntry|Page B}}',
        '提报理由。2026年2月1日 12:00 (CST)',
        '',
        '== 2026年3月 ==',
        '',
        '==== Page C ====',
        '{{CopyvioEntry|Page C}}',
        '提报理由。2026年3月1日 12:00 (CST)',
        '',
    ].join('\n');

/** 所有条目的签名时间都不足 3 天 */
const FRESH_CONTENT = CONTENT.replaceAll('2026年2月1日 12:00', '2026年3月1日 12:00');

/** 到期条目没有 CopyvioEntry 模板 */
const NO_TEMPLATE_CONTENT =
    PREFACE +
    ['== 2026年2月 ==', '', '==== Page A ====', '提报理由。2026年2月1日 12:00 (CST)', ''].join(
        '\n',
    );

/** 只有三级标题，没有日期区块 */
const NO_SECTION_CONTENT = `${PREFACE}=== 说明 ===\n没有日期区块。\n`;

interface StubOptions {
    content: string;
    /** checkExist 返回存在的页面 */
    existing?: string[];
    archiveExists?: boolean;
    revid?: number;
}

const configureStub = ({
    content,
    existing = [],
    archiveExists = false,
    revid = REVID,
}: StubOptions) => {
    const stub = runtime.stubs['qw']!;
    const existingPages = new Set(existing);

    stub.post.mockImplementation(async (params: { prop?: string; titles?: string }) => {
        if (params.prop === 'revisions') {
            return {
                data: {
                    query: {
                        pages: [{ title: params.titles, revisions: [{ content, revid }] }],
                    },
                },
            };
        }

        if (params.prop === 'info') {
            const title = params.titles!;
            const exists = title === ARCHIVE_TITLE ? archiveExists : existingPages.has(title);
            return {
                data: { query: { pages: [exists ? { title } : { title, missing: true }] } },
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

it('归档整个到期日期区块并从讨论页删除该区块', async () => {
    const stub = configureStub({ content: CONTENT });

    await import('@/bot/qw/archiveCV');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const archiveCall = stub.postWithToken.mock.calls[0]!;
    expect(archiveCall[0]).toBe('csrf');
    expect(archiveCall[1].title).toBe(ARCHIVE_TITLE);
    expect(archiveCall[1].text).toBe(`{{talkarchive}}\n\n${FEBRUARY_BLOCK}`);
    expect(archiveCall[1].appendtext).toBeUndefined();
    expect(archiveCall[1].summary).toBe('机器人：存档讨论');
    expect(archiveCall[1].bot).toBe(true);
    expect(archiveCall[1].watchlist).toBe('nochange');
    expect(archiveCall[1].minor).toBe(true);
    expect(archiveCall[2]).toEqual({ retry: 10, noCache: true });
    // 存档页修改后的完整内容
    expect(editedPage(archiveCall[1])).toBe(`{{talkarchive}}\n\n${FEBRUARY_BLOCK}`);

    const discussionCall = stub.postWithToken.mock.calls[1]!;
    expect(discussionCall[1].title).toBe(TARGET);
    expect(discussionCall[1].text).toBe(PREFACE + MARCH_SECTION);
    expect(discussionCall[1].baserevid).toBe(REVID);
    expect(discussionCall[1].summary).toBe('机器人：存档讨论');
    expect(discussionCall[2]).toEqual({ retry: 10, noCache: true });

    expect(console.log).toHaveBeenCalledWith('Archive Page A: Page A no longer exists.');
    expect(console.log).toHaveBeenCalledWith('Archive Page B: Page B no longer exists.');
    expect(console.log).toHaveBeenCalledWith(
        'Skip Page C: latest comment is less than 3 days old.',
    );
    expect(console.log).toHaveBeenCalledWith('Archived 2 entries.');
});

it('同一区块只有部分条目到期时，只归档到期条目并保留其余条目', async () => {
    const stub = configureStub({ content: CONTENT, existing: ['Page B'] });

    await import('@/bot/qw/archiveCV');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const archiveCall = stub.postWithToken.mock.calls[0]!;
    expect(archiveCall[1].title).toBe(ARCHIVE_TITLE);
    expect(archiveCall[1].text).toBe(
        `{{talkarchive}}\n\n== 2026年2月 ==\n${PAGE_A_ENTRY.trimEnd()}`,
    );
    expect(archiveCall[1].appendtext).toBeUndefined();

    // 讨论页保留未到期条目的完整段落，二级标题前仍只有一个空行
    const discussionCall = stub.postWithToken.mock.calls[1]!;
    expect(discussionCall[1].title).toBe(TARGET);
    expect(discussionCall[1].text).toBe(
        PREFACE + `== 2026年2月 ==\n\n${PAGE_B_KEPT}` + MARCH_SECTION,
    );
    expect(discussionCall[1].baserevid).toBe(REVID);

    expect(console.log).toHaveBeenCalledWith('Skip Page B: Page B still exists.');
    expect(console.log).toHaveBeenCalledWith('Archived 1 entries.');
});

it('目标页面仍然存在时不归档', async () => {
    const stub = configureStub({ content: CONTENT, existing: ['Page A', 'Page B'] });

    await import('@/bot/qw/archiveCV');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith('Skip Page A: Page A still exists.');
    expect(console.log).toHaveBeenCalledWith('Skip Page B: Page B still exists.');
    expect(console.log).toHaveBeenCalledWith('No entries need to be archived.');
});

it('签名时间戳不足 3 天时不归档', async () => {
    const stub = configureStub({ content: FRESH_CONTENT });

    await import('@/bot/qw/archiveCV');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(stub.post).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(
        'Skip Page A: latest comment is less than 3 days old.',
    );
    expect(console.log).toHaveBeenCalledWith(
        'Skip Page B: latest comment is less than 3 days old.',
    );
    expect(console.log).toHaveBeenCalledWith('No entries need to be archived.');
});

it('缺少 CopyvioEntry 模板时不归档', async () => {
    const stub = configureStub({ content: NO_TEMPLATE_CONTENT });

    await import('@/bot/qw/archiveCV');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(stub.post).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith('Skip Page A: CopyvioEntry template not found.');
    expect(console.log).toHaveBeenCalledWith('No entries need to be archived.');
});

it('没有日期区块时不归档', async () => {
    const stub = configureStub({ content: NO_SECTION_CONTENT });

    await import('@/bot/qw/archiveCV');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(stub.post).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith('No date sections found.');
});

it('存档页已存在时追加到期内容', async () => {
    const stub = configureStub({ content: CONTENT, archiveExists: true });

    await import('@/bot/qw/archiveCV');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const archiveCall = stub.postWithToken.mock.calls[0]!;
    expect(archiveCall[1].title).toBe(ARCHIVE_TITLE);
    expect(archiveCall[1].appendtext).toBe(`\n\n${FEBRUARY_BLOCK}`);
    expect(archiveCall[1].text).toBeUndefined();
    // 存档页修改前后完整内容：修改前内容 + 追加的整段到期区块
    expect(editedPage(archiveCall[1], ARCHIVE_PAGE_BEFORE)).toBe(
        `${ARCHIVE_PAGE_BEFORE}\n\n${FEBRUARY_BLOCK}`,
    );
});
