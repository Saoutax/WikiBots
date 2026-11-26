import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { editedPage, runtime } from '../../../helpers/bot';

type MockFn = ReturnType<typeof vi.fn>;

interface WriteStub {
    postWithToken: MockFn;
}

/** 取出 postWithToken 每次调用的请求体（忽略第一个 token 参数） */
const writeBodies = (stub: WriteStub): Record<string, unknown>[] =>
    stub.postWithToken.mock.calls.map(call => call[1] as Record<string, unknown>);

const useNow = (iso: string): void => {
    vi.useFakeTimers({ now: new Date(iso) });
};

const mockHall = (content: string, revid: number): void => {
    const stub = runtime.stubs['uew']!;

    stub.post.mockResolvedValue({
        data: {
            query: {
                pages: [
                    {
                        title: '地球联合百科讨论:会议大厅',
                        revisions: [{ content, revid }],
                    },
                ],
            },
        },
    });
    stub.postWithToken.mockResolvedValue({ data: { result: 'Success' } });
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

it('每月 1 日归档过期讨论串并保护存档页', async () => {
    useNow('2026-01-01T04:00:00.000Z');
    /** 会议大厅修改前完整内容 */
    const HALL_BEFORE = [
        '== 旧讨论 ==',
        '内容 2025年12月20日 12:00 (CST)',
        '',
        '== 新讨论 ==',
        '内容 2026年1月1日 08:00 (CST)',
        '',
    ].join('\n');
    const archiveTitle = '地球联合百科讨论:会议大厅/存档/2025年12月';
    /** 存档页修改后完整内容（本脚本每次都以 text 覆盖写入，不追加） */
    const ARCHIVE_PAGE_AFTER = '== 旧讨论 ==\n内容 2025年12月20日 12:00 (CST)\n\n\n';
    /** 会议大厅修改后完整内容 */
    const HALL_AFTER = '== 新讨论 ==\n内容 2026年1月1日 08:00 (CST)\n';
    mockHall(HALL_BEFORE, 7);

    await import('@/bot/uew/archiveThread');
    const result = await runtime.drain();
    const stub = runtime.stubs['uew']!;

    expect(result.errors).toEqual([]);
    expect(stub.post).toHaveBeenCalledTimes(1);
    expect(stub.post).toHaveBeenCalledWith({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content|ids',
        titles: '地球联合百科讨论:会议大厅',
    });
    expect(stub.postWithToken).toHaveBeenCalledTimes(3);

    const [archiveEdit, hallEdit, protectCall] = writeBodies(stub);
    expect(archiveEdit).toMatchObject({
        action: 'edit',
        title: archiveTitle,
        text: ARCHIVE_PAGE_AFTER,
        summary: '存档过期讨论串',
        tags: 'Bot',
    });
    expect(archiveEdit?.['baserevid']).toBeUndefined();
    // 存档页修改后的完整内容
    expect(editedPage(archiveEdit!)).toBe(ARCHIVE_PAGE_AFTER);
    expect(hallEdit).toMatchObject({
        action: 'edit',
        title: '地球联合百科讨论:会议大厅',
        text: HALL_AFTER,
        baserevid: 7,
        summary: '存档过期讨论串',
        tags: 'Bot',
    });
    // 会议大厅修改前后：HALL_BEFORE（HALL_BEFORE 中旧讨论已移入存档）
    expect(editedPage(hallEdit!)).toBe(HALL_AFTER);
    expect(protectCall).toMatchObject({
        action: 'protect',
        title: archiveTitle,
        protections: 'edit=sysop|move=sysop',
        reason: '会议大厅存档',
        tags: 'Bot',
        bot: true,
    });
});

it('非每月 1 日时不发起任何请求', async () => {
    useNow('2026-01-02T04:00:00.000Z');

    await import('@/bot/uew/archiveThread');
    const result = await runtime.drain();
    const stub = runtime.stubs['uew']!;

    expect(result.errors).toEqual([]);
    expect(stub.post).not.toHaveBeenCalled();
    expect(stub.postWithToken).not.toHaveBeenCalled();
});

it('每月 1 日但没有到期讨论串时不编辑', async () => {
    useNow('2026-01-01T04:00:00.000Z');
    const content = '== 新讨论 ==\n内容 2026年1月1日 08:00 (CST)\n';
    mockHall(content, 8);

    await import('@/bot/uew/archiveThread');
    const result = await runtime.drain();
    const stub = runtime.stubs['uew']!;

    expect(result.errors).toEqual([]);
    expect(stub.post).toHaveBeenCalledTimes(1);
    expect(stub.postWithToken).not.toHaveBeenCalled();
});
