import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editedPage, runtime } from '../../../helpers/bot';

const TARGET = 'Qiuwen_talk:存废讨论/文件快速删除提报';
const ARCHIVE_TITLE = 'Qiuwen_talk:存废讨论/文件快速删除提报/存档/2026年';
const REVID = 789;

/** 存档页在本次运行前的完整内容（脚本只会向后追加） */
const ARCHIVE_PAGE_BEFORE =
    '{{talkarchive}}\n\n== 2025年存档 ==\n\n* [[:File:Old.png]] 早期提报。\n';

/** 2026-03-10 12:00 (CST) */
const NOW = new Date('2026-03-10T04:00:00.000Z');

const SIG_OLD = '2026年1月1日 (四) 00:00 (CST)';
const SIG_RECENT = '2026年3月9日 (一) 00:00 (CST)';

/**
 * 注意：`[[File:Example.png]]` 会被 wikiparser 解析为 `file` 节点，
 * archiveList 只从 `link` 节点取链接，故 fixture 使用带前导冒号的 `[[:File:...]]`（ns=6 的普通链接）。
 */
const ENTRY_MISSING = `* [[:File:Example.png]] 理由一。${SIG_OLD}
*: 回复内容。2026年1月2日 (五) 00:00 (CST)`;
const ENTRY_EXISTS = `* [[:File:Kept.png]] 理由二。${SIG_OLD}`;
const ENTRY_NO_FILE = `* [[Page|普通页面]] 理由三。${SIG_OLD}`;

interface EditBody {
    title?: string;
    text?: string;
    appendtext?: string;
    summary?: string;
}

const routeQueries = (
    stub: { post: ReturnType<typeof vi.fn> },
    content: string,
    pages: Record<string, { missing?: true }>,
) => {
    stub.post.mockImplementation(async (params: { prop?: string; titles?: string }) => {
        if (params.prop === 'revisions') {
            if (params.titles !== TARGET) {
                throw new Error(`Unexpected revisions title: ${params.titles}`);
            }
            return {
                data: {
                    query: {
                        pages: [{ title: TARGET, revisions: [{ content, revid: REVID }] }],
                    },
                },
            };
        }

        if (params.prop === 'info') {
            const page = params.titles === undefined ? undefined : pages[params.titles];
            if (page === undefined) {
                throw new Error(`Unexpected info title: ${params.titles}`);
            }
            return { data: { query: { pages: [{ title: params.titles, ...page }] } } };
        }

        throw new Error(`Unexpected request: ${JSON.stringify(params)}`);
    });
};

const getEdit = (index: number): EditBody => {
    const call = runtime.stubs['qw']!.postWithToken.mock.calls[index];
    if (!call) {
        throw new Error(`Missing edit call #${index}`);
    }
    return call[1] as EditBody;
};

beforeEach(() => {
    vi.resetModules();
    runtime.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

it('归档目标文件已不存在的条目，保留仍存在与无文件链接的条目', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const content = `${ENTRY_MISSING}\n${ENTRY_EXISTS}\n${ENTRY_NO_FILE}\n`;

    routeQueries(stub, content, {
        'File:Example.png': { missing: true },
        'File:Kept.png': {},
        [ARCHIVE_TITLE]: { missing: true },
    });
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveFileCSD');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    // 检查的文件标题来自行内 ns=6 链接
    expect(stub.post).toHaveBeenCalledWith(
        expect.objectContaining({ prop: 'info', titles: 'File:Example.png' }),
    );
    expect(stub.post).toHaveBeenCalledWith(
        expect.objectContaining({ prop: 'info', titles: 'File:Kept.png' }),
    );
    expect(stub.post).not.toHaveBeenCalledWith(
        expect.objectContaining({ prop: 'info', titles: 'Page' }),
    );

    const archiveEdit = getEdit(0);
    expect(archiveEdit.title).toBe(ARCHIVE_TITLE);
    expect(archiveEdit.text).toBe(`{{talkarchive}}\n\n${ENTRY_MISSING}`);
    expect(archiveEdit.summary).toBe('机器人：存档讨论');
    // 存档页修改后的完整内容
    expect(editedPage(archiveEdit)).toBe(`{{talkarchive}}\n\n${ENTRY_MISSING}`);

    const discussionEdit = getEdit(1);
    expect(discussionEdit.title).toBe(TARGET);
    expect(discussionEdit.text).toBe(`${ENTRY_EXISTS}\n${ENTRY_NO_FILE}\n`);
    expect(discussionEdit.summary).toBe('机器人：存档讨论');
});

it('存档页已存在时追加内容', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const content = `${ENTRY_MISSING}\n${ENTRY_NO_FILE}\n`;

    routeQueries(stub, content, {
        'File:Example.png': { missing: true },
        [ARCHIVE_TITLE]: {},
    });
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveFileCSD');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const archiveEdit = getEdit(0);
    expect(archiveEdit.title).toBe(ARCHIVE_TITLE);
    expect(archiveEdit.text).toBeUndefined();
    expect(archiveEdit.appendtext).toBe(`\n\n${ENTRY_MISSING}`);
    // 存档页修改前后完整内容
    expect(editedPage(archiveEdit, ARCHIVE_PAGE_BEFORE)).toBe(
        `${ARCHIVE_PAGE_BEFORE}\n\n${ENTRY_MISSING}`,
    );

    const discussionEdit = getEdit(1);
    expect(discussionEdit.title).toBe(TARGET);
    expect(discussionEdit.text).toBe(`${ENTRY_NO_FILE}\n`);
});

it('没有需要存档的条目时不编辑', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const entryRecent = `* [[:File:Recent.png]] 理由四。${SIG_RECENT}`;
    const content = `${ENTRY_EXISTS}\n${ENTRY_NO_FILE}\n${entryRecent}\n`;

    routeQueries(stub, content, {
        'File:Kept.png': {},
        [ARCHIVE_TITLE]: { missing: true },
    });

    await import('@/bot/qw/archiveFileCSD');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(stub.post).toHaveBeenCalledTimes(2);
    expect(stub.post).toHaveBeenCalledWith(
        expect.objectContaining({ prop: 'revisions', titles: TARGET }),
    );
    expect(stub.post).toHaveBeenCalledWith(
        expect.objectContaining({ prop: 'info', titles: 'File:Kept.png' }),
    );
    expect(stub.post).not.toHaveBeenCalledWith(
        expect.objectContaining({ prop: 'info', titles: 'File:Recent.png' }),
    );
    expect(console.log).toHaveBeenCalledWith('No entries need to be archived.');
});
