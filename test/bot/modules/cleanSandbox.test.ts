import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CleanSandbox } from '@/bot/modules/cleanSandbox';
import { createApiStub, type ApiStub } from '../../helpers/api';

const NOW = new Date('2026-01-01T00:00:00.000Z'),
    TITLE = 'User:Example/沙盒',
    PAGE_MAP = {
        [TITLE]: { content: '清理后的内容', summary: '清理沙盒' },
    };

const minutesBefore = (minutes: number): string =>
    new Date(NOW.getTime() - minutes * 60_000).toISOString();

const mockPages = (stub: ApiStub, pages: unknown[]): void => {
    stub.post.mockResolvedValue({ data: { query: { pages } } });
};

describe('CleanSandbox', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('touched 超过 180 分钟时提交编辑', async () => {
        const stub = createApiStub();
        stub.postWithToken.mockResolvedValue({ data: { result: 'Success' } });
        mockPages(stub, [
            {
                title: TITLE,
                revisions: [{ timestamp: minutesBefore(5), revid: 100 }],
                touched: minutesBefore(181),
            },
        ]);

        await new CleanSandbox(stub.api).main(PAGE_MAP);

        expect(stub.post).toHaveBeenCalledWith({
            prop: 'revisions|info',
            titles: [TITLE],
            rvprop: 'timestamp|revid',
            inprop: 'touched',
        });
        expect(stub.postWithToken).toHaveBeenCalledTimes(1);
        expect(stub.postWithToken).toHaveBeenCalledWith(
            'csrf',
            expect.objectContaining({
                title: TITLE,
                text: '清理后的内容',
                baserevid: 100,
                summary: '清理沙盒',
                tags: 'Bot',
            }),
            { retry: 10, noCache: true },
        );
    });

    it('touched 在 180 分钟内时跳过编辑', async () => {
        const stub = createApiStub();
        mockPages(stub, [
            {
                title: TITLE,
                revisions: [{ timestamp: minutesBefore(5), revid: 100 }],
                touched: minutesBefore(30),
            },
        ]);

        await new CleanSandbox(stub.api).main(PAGE_MAP);

        expect(stub.postWithToken).not.toHaveBeenCalled();
    });

    it('touched 缺失时回退到 revisions[0].timestamp', async () => {
        const stub = createApiStub();
        stub.postWithToken.mockResolvedValue({ data: { result: 'Success' } });
        mockPages(stub, [
            {
                title: TITLE,
                revisions: [{ timestamp: minutesBefore(200), revid: 200 }],
            },
        ]);

        await new CleanSandbox(stub.api).main(PAGE_MAP);

        expect(stub.postWithToken).toHaveBeenCalledTimes(1);
        expect(stub.postWithToken).toHaveBeenCalledWith(
            'csrf',
            expect.objectContaining({
                title: TITLE,
                text: '清理后的内容',
                baserevid: 200,
                summary: '清理沙盒',
                tags: 'Bot',
            }),
            { retry: 10, noCache: true },
        );
    });
});
