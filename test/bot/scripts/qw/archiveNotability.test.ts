import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editedPage, runtime } from '../../../helpers/bot';

const TARGET = 'Qiuwen_talk:存废讨论/关注度提报';
const ARCHIVE_TITLE = 'Qiuwen_talk:存废讨论/关注度提报/存档/2026年';
const REVID = 321;

/** 存档页在本次运行前的完整内容（脚本只会向后追加） */
const ARCHIVE_PAGE_BEFORE =
    '{{talkarchive}}\n\n== 2025年存档 ==\n\n* {{Find sources|Old Page}} 早期提报。2025年12月1日 (一) 00:00 (CST)\n';

/** 2026-03-10 12:00 (CST) */
const NOW = new Date('2026-03-10T04:00:00.000Z');

const SIG_OLD = '2026年1月1日 (四) 00:00 (CST)';

interface EditBody {
    title?: string;
    text?: string;
    appendtext?: string;
    summary?: string;
}

const routeQueries = (
    stub: { post: ReturnType<typeof vi.fn> },
    content: string,
    archiveExists = false,
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
            if (params.titles === ARCHIVE_TITLE) {
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
            // 被提报页面视为不存在
            return {
                data: {
                    query: { pages: [{ title: params.titles, missing: true }] },
                },
            };
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

/** 断言 checkExist 实际查询的标题顺序与最终归档正文 */
const expectArchived = (entry: string, infoTitles: string[]) => {
    const stub = runtime.stubs['qw']!;

    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const queriedTitles = stub.post.mock.calls
        .filter(call => (call[0] as { prop?: string }).prop === 'info')
        .map(call => (call[0] as { titles?: string }).titles);
    expect(queriedTitles).toEqual(infoTitles);

    const archiveEdit = getEdit(0);
    expect(archiveEdit.title).toBe(ARCHIVE_TITLE);
    expect(archiveEdit.text).toBe(`{{talkarchive}}\n\n${entry}`);
    expect(archiveEdit.summary).toBe('机器人：存档讨论');
    // 存档页修改后的完整内容
    expect(editedPage(archiveEdit)).toBe(`{{talkarchive}}\n\n${entry}`);

    const discussionEdit = getEdit(1);
    expect(discussionEdit.title).toBe(TARGET);
    expect(discussionEdit.text).toBe('');
    expect(discussionEdit.summary).toBe('机器人：存档讨论');
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

it('首行有 Find sources 模板时使用模板中的标题', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const entry = `* {{Find sources|Page X}} 关注度提报。${SIG_OLD}`;

    routeQueries(stub, `${entry}\n`);
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveNotability');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expectArchived(entry, ['Page X', ARCHIVE_TITLE]);
});

it('没有 Find sources 模板时取首个非用户/用户讨论命名空间的链接', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const entry = `* [[User:Someone|Someone]]：[[Page Y]] 关注度不足。${SIG_OLD}`;

    routeQueries(stub, `${entry}\n`);
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveNotability');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    // `[[Page Y]]` 的链接目标为 `Page_Y`（空白转为下划线）
    expectArchived(entry, ['Page_Y', ARCHIVE_TITLE]);
});

it('仅链接到用户页时回退到第一个链接', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const entry = `* [[User:Only|Only]] 提报。${SIG_OLD}`;

    routeQueries(stub, `${entry}\n`);
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveNotability');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expectArchived(entry, ['User:Only', ARCHIVE_TITLE]);
});

it('存档页已存在时追加条目，无法解析目标的条目保留在讨论页', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const entry = `* {{Find sources|Page X}} 关注度提报。${SIG_OLD}`;
    const kept = `* 缺少链接的说明。${SIG_OLD}`;

    routeQueries(stub, `${entry}\n${kept}\n`, true);
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveNotability');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    // 存档页修改前后完整内容：修改前内容 + 追加的到期条目
    const archiveEdit = getEdit(0);
    expect(archiveEdit.title).toBe(ARCHIVE_TITLE);
    expect(editedPage(archiveEdit, ARCHIVE_PAGE_BEFORE)).toBe(`${ARCHIVE_PAGE_BEFORE}\n\n${entry}`);

    // 讨论页修改后的完整内容：仅保留无法解析目标的条目
    const discussionEdit = getEdit(1);
    expect(discussionEdit.title).toBe(TARGET);
    expect(discussionEdit.text).toBe(`${kept}\n`);
});
