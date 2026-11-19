import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editedPage, runtime } from '../../../helpers/bot';

const TARGETS = [
    'Qiuwen_talk:权限申请/申请巡查回退权',
    'Qiuwen_talk:权限申请/申请巡查豁免权',
    'Qiuwen_talk:权限申请/申请确认用户权',
    'Qiuwen_talk:权限申请/申请大量消息发送权',
    'Qiuwen_talk:权限申请/申请导入权',
    'Qiuwen_talk:权限申请/申请活动组织权',
    'Qiuwen_talk:权限申请/申请模板编辑权',
    'Qiuwen_talk:权限申请/申请机器人权限',
    'Qiuwen_talk:权限申请/申请IP封禁豁免权',
];

const EDITED_TARGET = TARGETS[0]!;
const FAILING_TARGET = TARGETS[4]!;
const ARCHIVE_TITLE = `${EDITED_TARGET}/存档/2026年`;
const REVID = 303;

/** 存档页在本次运行前的完整内容（脚本只会向后追加） */
const ARCHIVE_PAGE_BEFORE =
    '{{talkarchive}}\n\n== 2025年 ==\n\n==== 早期申请 ====\n早期存档内容。\n';

const PREFACE = '本页用于申请巡查回退权。\n\n';

const EXPIRED_SECTION = '==== 申请一 ====\n{{Status|done}}\n申请理由。2026年2月1日 12:00 (CST)\n\n';

const KEPT_SECTION = '==== 申请二 ====\n{{Status|done}}\n申请理由。2026年3月1日 12:00 (CST)\n';

const EDITED_CONTENT = PREFACE + EXPIRED_SECTION + KEPT_SECTION;

/** 脚本以 `preface.replace(/\n*$/, '\n\n')` 拼接待保留段 */
const EXPECTED_DISCUSSION = `${PREFACE.replace(/\n*$/, '\n\n')}${KEPT_SECTION}`;

interface StubOptions {
    /** getContent 抛错的目标页 */
    failingTarget?: string | undefined;
    archiveExists?: boolean;
}

const configureStub = ({ failingTarget, archiveExists = false }: StubOptions = {}) => {
    const stub = runtime.stubs['qw']!;

    stub.post.mockImplementation(async (params: { prop?: string; titles?: string }) => {
        if (params.prop === 'revisions') {
            if (params.titles === failingTarget) {
                throw new Error('network failure');
            }

            const edited = params.titles === EDITED_TARGET;
            return {
                data: {
                    query: {
                        pages: [
                            {
                                title: params.titles,
                                revisions: [
                                    {
                                        content: edited ? EDITED_CONTENT : '',
                                        revid: edited ? REVID : 1,
                                    },
                                ],
                            },
                        ],
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

it('只编辑存在到期 h4 段的目标页，其余目标不编辑', async () => {
    const stub = configureStub();

    await import('@/bot/qw/archiveRFR');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);

    // 9 个目标页都读取了正文
    const contentTitles = stub.post.mock.calls
        .map(([params]) => params as { prop?: string; titles?: string })
        .filter(params => params.prop === 'revisions')
        .map(params => params.titles);
    expect(contentTitles).toHaveLength(TARGETS.length);
    expect(contentTitles).toEqual(expect.arrayContaining([...TARGETS]));

    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const archiveCall = stub.postWithToken.mock.calls[0]!;
    expect(archiveCall[0]).toBe('csrf');
    expect(archiveCall[1].title).toBe(ARCHIVE_TITLE);
    expect(archiveCall[1].text).toBe(`{{talkarchive}}\n\n${EXPIRED_SECTION}`);
    expect(archiveCall[1].appendtext).toBeUndefined();
    expect(archiveCall[1].summary).toBe('机器人：存档讨论');
    expect(archiveCall[1].bot).toBe(true);
    expect(archiveCall[2]).toEqual({ retry: 10, noCache: true });
    // 存档页修改后的完整内容
    expect(editedPage(archiveCall[1])).toBe(`{{talkarchive}}\n\n${EXPIRED_SECTION}`);

    const discussionCall = stub.postWithToken.mock.calls[1]!;
    expect(discussionCall[1].title).toBe(EDITED_TARGET);
    expect(discussionCall[1].text).toBe(EXPECTED_DISCUSSION);
    expect(discussionCall[1].baserevid).toBe(REVID);
    expect(discussionCall[1].summary).toBe('机器人：存档讨论');

    const editedTitles = stub.postWithToken.mock.calls.map(([, body]) => body.title);
    expect(editedTitles).toEqual([ARCHIVE_TITLE, EDITED_TARGET]);

    expect(console.log).toHaveBeenCalledWith(`Successfully archived 1 threads in ${EDITED_TARGET}`);
    expect(console.log).toHaveBeenCalledWith(`No threads need to be archived in ${TARGETS[1]!}`);
});

it('某个目标页读取正文失败时记录日志并继续处理其他目标', async () => {
    const stub = configureStub({ failingTarget: FAILING_TARGET });

    await import('@/bot/qw/archiveRFR');
    const result = await runtime.drain();

    // 错误在脚本内部捕获，不会冒泡到 run()
    expect(result.errors).toEqual([]);
    expect(console.log).toHaveBeenCalledWith(
        `Failed to archive ${FAILING_TARGET}: Error: network failure`,
    );

    // 其余目标页仍然被处理，到期页照常编辑
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);
    const discussionCall = stub.postWithToken.mock.calls[1]!;
    expect(discussionCall[1].title).toBe(EDITED_TARGET);
    expect(discussionCall[1].text).toBe(EXPECTED_DISCUSSION);

    const editedTitles = stub.postWithToken.mock.calls.map(([, body]) => body.title);
    expect(editedTitles).toEqual([ARCHIVE_TITLE, EDITED_TARGET]);
    expect(editedTitles).not.toContain(FAILING_TARGET);
    expect(console.log).toHaveBeenCalledWith(`Successfully archived 1 threads in ${EDITED_TARGET}`);
});

it('存档页已存在时追加到期内容', async () => {
    const stub = configureStub({ archiveExists: true });

    await import('@/bot/qw/archiveRFR');
    const result = await runtime.drain();

    expect(result.errors).toEqual([]);
    expect(stub.postWithToken).toHaveBeenCalledTimes(2);

    const archiveCall = stub.postWithToken.mock.calls[0]!;
    expect(archiveCall[1].title).toBe(ARCHIVE_TITLE);
    expect(archiveCall[1].appendtext).toBe(`\n\n${EXPIRED_SECTION}`);
    expect(archiveCall[1].text).toBeUndefined();
    // 存档页修改前后完整内容
    expect(editedPage(archiveCall[1], ARCHIVE_PAGE_BEFORE)).toBe(
        `${ARCHIVE_PAGE_BEFORE}\n\n${EXPIRED_SECTION}`,
    );

    const discussionCall = stub.postWithToken.mock.calls[1]!;
    expect(discussionCall[1].text).toBe(EXPECTED_DISCUSSION);
});
