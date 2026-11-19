import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editedPage, runtime } from '../../../helpers/bot';

const TARGET = 'Qiuwen_talk:版本删除提报';
const ARCHIVE_TITLE = 'Qiuwen_talk:版本删除提报/存档/2026年';
const REVID = 123;

/** 存档页在本次运行前的完整内容（脚本只会向后追加） */
const ARCHIVE_PAGE_BEFORE =
    '{{talkarchive}}\n\n== 2025年 ==\n\n{{Revdel|早期提报|status=done}} 早期存档。\n';

/** 2026-03-10 12:00 (CST) */
const NOW = new Date('2026-03-10T04:00:00.000Z');

const SIG_OLD = '2026年1月1日 (四) 00:00 (CST)';
const SIG_RECENT = '2026年3月9日 (一) 00:00 (CST)';

const PREFACE = '页面说明。\n\n== 提报区域 ==';

interface EditBody {
    title?: string;
    text?: string;
    appendtext?: string;
    summary?: string;
    baserevid?: number;
}

/** 按请求参数路由 qw 的只读查询 */
const routeQueries = (
    stub: { post: ReturnType<typeof vi.fn> },
    content: string,
    archiveExists: boolean,
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
            if (params.titles !== ARCHIVE_TITLE) {
                throw new Error(`Unexpected info title: ${params.titles}`);
            }
            return {
                data: {
                    query: {
                        pages: [
                            {
                                title: ARCHIVE_TITLE,
                                ...(archiveExists ? {} : { missing: true }),
                            },
                        ],
                    },
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

beforeEach(() => {
    vi.resetModules();
    runtime.reset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

it('归档已完成且到期的提报，保留未到期与非白名单状态的段落', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const reqA = `{{Revdel|Page A|status=done}} ${SIG_OLD}`;
    const reqB = `{{Revdel|Page B|status=done}} ${SIG_RECENT}`;
    const reqC = `{{Revdel|Page C|status=on hold}} ${SIG_OLD}`;
    const content = `${PREFACE}\n${reqA}\n${reqB}\n${reqC}`;

    routeQueries(stub, content, false);
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveRFRD');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    // 提报段从模板起始位置切分，未到期段（Page B）与状态不在白名单的段（Page C）保留
    const archiveEdit = getEdit(0);
    expect(archiveEdit.title).toBe(ARCHIVE_TITLE);
    expect(archiveEdit.text).toBe(`{{talkarchive}}\n\n${reqA}\n`);
    expect(archiveEdit.appendtext).toBeUndefined();
    expect(archiveEdit.summary).toBe('机器人：存档讨论');
    // 存档页修改后的完整内容
    expect(editedPage(archiveEdit)).toBe(`{{talkarchive}}\n\n${reqA}\n`);

    const discussionEdit = getEdit(1);
    expect(discussionEdit.title).toBe(TARGET);
    expect(discussionEdit.text).toBe(`${PREFACE}\n${reqB}\n${reqC}`);
    expect(discussionEdit.summary).toBe('机器人：存档讨论');
    expect(discussionEdit.baserevid).toBe(REVID);

    // 前言保留在讨论页，未到期/非白名单段原样保留
    expect(discussionEdit.text).toContain('== 提报区域 ==');
    expect(discussionEdit.text).toContain(`{{Revdel|Page B|status=done}} ${SIG_RECENT}`);
    expect(discussionEdit.text).toContain(`{{Revdel|Page C|status=on hold}} ${SIG_OLD}`);
});

it('没有到期提报时不编辑', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const content = [
        PREFACE,
        `{{Revdel|Page A|status=done}} ${SIG_RECENT}`,
        `{{Revdel|Page B|status=on hold}} ${SIG_OLD}`,
        `{{Revdel|Page C|status=nd}} ${SIG_RECENT}`,
    ].join('\n');

    routeQueries(stub, content, false);

    await import('@/bot/qw/archiveRFRD');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(stub.post).toHaveBeenCalledTimes(1);
    expect(stub.post).toHaveBeenCalledWith(
        expect.objectContaining({ prop: 'revisions', titles: TARGET }),
    );
    expect(console.log).toHaveBeenCalledWith('No threads need to be archived.');
});

it('存档页已存在时追加内容而不是重建', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const reqA = `{{Revdel|Page A|status=done}} ${SIG_OLD}`;
    const content = `${PREFACE}\n${reqA}`;

    routeQueries(stub, content, true);
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveRFRD');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const archiveEdit = getEdit(0);
    expect(archiveEdit.title).toBe(ARCHIVE_TITLE);
    expect(archiveEdit.text).toBeUndefined();
    expect(archiveEdit.appendtext).toBe(`\n\n${reqA}`);
    expect(archiveEdit.summary).toBe('机器人：存档讨论');
    // 存档页修改前后完整内容
    expect(editedPage(archiveEdit, ARCHIVE_PAGE_BEFORE)).toBe(`${ARCHIVE_PAGE_BEFORE}\n\n${reqA}`);

    const discussionEdit = getEdit(1);
    expect(discussionEdit.title).toBe(TARGET);
    expect(discussionEdit.text).toBe(`${PREFACE}\n`);
    expect(discussionEdit.baserevid).toBe(REVID);
});
