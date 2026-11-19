import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editedPage, runtime } from '../../../helpers/bot';

const EDIT_TARGET = 'Qiuwen_talk:茶馆/编辑';
const EDIT_ARCHIVE_TITLE = 'Qiuwen_talk:茶馆/存档/编辑/2026年03月';
const OTHER_TARGET = 'Qiuwen_talk:茶馆/其他';
const REVID = 456;

/** 存档页在本次运行前的完整内容（脚本只会向后追加） */
const ARCHIVE_PAGE_BEFORE = '{{talkarchive}}\n\n== 2026年1月存档 ==\n早期存档内容。\n';

/** 2026-03-10 12:00 (CST) */
const NOW = new Date('2026-03-10T04:00:00.000Z');

interface EditBody {
    title?: string;
    text?: string;
    appendtext?: string;
    summary?: string;
    baserevid?: number;
}

/** 编辑页 fixture：preface 与各章节 thread 原文，便于断言 parsedToString 的结果 */
const EDIT_PREFACE = '{{存档页顶}}\n\n';
const RESOLVED_THREAD = `== 已解决章节 ==
{{MarkAsResolved|time=2026-01-01|days=3}}
讨论 A。2026年1月2日 (五) 12:00 (CST)

`;
const PENDING_THREAD = `== 公示章节 ==
{{正在公示}}
讨论 B。2026年1月2日 (五) 12:00 (CST)

`;
const ENDED_THREAD = `== 结束章节 ==
{{讨论结束|time=2026-01-01}}
讨论 C。2026年1月2日 (五) 12:00 (CST)

`;
const NOT_DUE_THREAD = `== 未到期章节 ==
{{MarkAsResolved|time=2026-01-01|days=100}}
讨论 D。2026年1月2日 (五) 12:00 (CST)

`;
const PLAIN_THREAD = `== 普通章节 ==
讨论 E。2026年1月2日 (五) 12:00 (CST)
`;

const EDIT_FIXTURE =
    EDIT_PREFACE + RESOLVED_THREAD + PENDING_THREAD + ENDED_THREAD + NOT_DUE_THREAD + PLAIN_THREAD;

const OTHER_PREFACE = '{{存档页顶}}\n\n';
const OTHER_PENDING_THREAD = `== 进行中章节 ==
{{正在公示}}
讨论 F。2026年3月9日 (一) 12:00 (CST)

`;
const OTHER_PLAIN_THREAD = `== 普通章节 ==
讨论 G。2026年3月9日 (一) 12:00 (CST)
`;
const OTHER_FIXTURE = OTHER_PREFACE + OTHER_PENDING_THREAD + OTHER_PLAIN_THREAD;

const routeQueries = (
    stub: { post: ReturnType<typeof vi.fn> },
    fixtures: Record<string, string>,
    archiveExists = false,
) => {
    stub.post.mockImplementation(async (params: { prop?: string; titles?: string }) => {
        if (params.prop === 'revisions') {
            const content = params.titles === undefined ? undefined : fixtures[params.titles];
            if (content === undefined) {
                throw new Error(`Unexpected revisions title: ${params.titles}`);
            }
            return {
                data: {
                    query: {
                        pages: [{ title: params.titles, revisions: [{ content, revid: REVID }] }],
                    },
                },
            };
        }

        if (params.prop === 'info') {
            if (params.titles !== EDIT_ARCHIVE_TITLE) {
                throw new Error(`Unexpected info title: ${params.titles}`);
            }
            return {
                data: {
                    query: {
                        pages: [
                            {
                                title: EDIT_ARCHIVE_TITLE,
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

it('只归档带标记且到期的章节，存档标题按月生成', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    routeQueries(stub, { [EDIT_TARGET]: EDIT_FIXTURE, [OTHER_TARGET]: OTHER_FIXTURE });
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveTEA');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    // 存档页：{{正在公示}} 无 time 参数不归档，未marked 的普通章节不归档
    const archiveEdit = getEdit(0);
    expect(archiveEdit.title).toBe(EDIT_ARCHIVE_TITLE);
    expect(archiveEdit.text).toBe(`{{talkarchive}}\n\n${RESOLVED_THREAD}${ENDED_THREAD}`);
    expect(archiveEdit.summary).toBe('机器人：存档讨论');
    // 存档页修改后的完整内容
    expect(editedPage(archiveEdit)).toBe(`{{talkarchive}}\n\n${RESOLVED_THREAD}${ENDED_THREAD}`);

    // 讨论页：parsedToString(删除已归档章节后的结果)
    const discussionEdit = getEdit(1);
    expect(discussionEdit.title).toBe(EDIT_TARGET);
    expect(discussionEdit.text).toBe(EDIT_PREFACE + PENDING_THREAD + NOT_DUE_THREAD + PLAIN_THREAD);
    expect(discussionEdit.summary).toBe('机器人：存档讨论');
    expect(discussionEdit.baserevid).toBe(REVID);
});

it('存档页已存在时追加到期章节，其他章节保持原样', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    routeQueries(stub, { [EDIT_TARGET]: EDIT_FIXTURE, [OTHER_TARGET]: OTHER_FIXTURE }, true);
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveTEA');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    // 存档页修改前后完整内容：修改前内容 + 追加的到期章节
    const archiveEdit = getEdit(0);
    expect(archiveEdit.title).toBe(EDIT_ARCHIVE_TITLE);
    expect(editedPage(archiveEdit, ARCHIVE_PAGE_BEFORE)).toBe(
        `${ARCHIVE_PAGE_BEFORE}\n\n${RESOLVED_THREAD}${ENDED_THREAD}`,
    );

    // 讨论页修改后的完整内容
    const discussionEdit = getEdit(1);
    expect(discussionEdit.text).toBe(EDIT_PREFACE + PENDING_THREAD + NOT_DUE_THREAD + PLAIN_THREAD);
    expect(discussionEdit.baserevid).toBe(REVID);
});

it('另一目标页没有到期章节时保持原样', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    routeQueries(stub, { [EDIT_TARGET]: EDIT_FIXTURE, [OTHER_TARGET]: OTHER_FIXTURE });
    stub.postWithToken.mockResolvedValue({ data: { edit: { result: 'Success' } } });

    await import('@/bot/qw/archiveTEA');
    await runtime.drain();

    const editedTitles = stub.postWithToken.mock.calls.map(call => (call[1] as EditBody).title);
    expect(editedTitles).not.toContain(OTHER_TARGET);
    expect(editedTitles).toEqual([EDIT_ARCHIVE_TITLE, EDIT_TARGET]);
});

it('两个目标都没有到期章节时不编辑', async () => {
    vi.useFakeTimers({ now: NOW });

    const stub = runtime.stubs['qw']!;
    const notDueFixture = `${EDIT_PREFACE}== 未到期章节 ==
{{MarkAsResolved|time=2026-01-01|days=200}}
讨论 H。2026年1月2日 (五) 12:00 (CST)

== 公示章节 ==
{{正在公示}}
讨论 I。2026年3月9日 (一) 12:00 (CST)
`;
    const otherNotDueFixture = `${OTHER_PREFACE}== 普通章节 ==
讨论 J。2026年3月9日 (一) 12:00 (CST)
`;

    routeQueries(stub, { [EDIT_TARGET]: notDueFixture, [OTHER_TARGET]: otherNotDueFixture });

    await import('@/bot/qw/archiveTEA');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).not.toHaveBeenCalled();
    expect(stub.post).toHaveBeenCalledTimes(2);
    expect(stub.post).toHaveBeenCalledWith(
        expect.objectContaining({ prop: 'revisions', titles: EDIT_TARGET }),
    );
    expect(stub.post).toHaveBeenCalledWith(
        expect.objectContaining({ prop: 'revisions', titles: OTHER_TARGET }),
    );
});
