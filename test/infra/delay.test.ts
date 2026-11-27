import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { delay } from '@/infra/delay';

describe('delay', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('默认延迟 3000 毫秒', async () => {
        let finished = false;
        const pending = delay().then(() => {
            finished = true;
        });

        await vi.advanceTimersByTimeAsync(2999);
        expect(finished).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await pending;
        expect(finished).toBe(true);
    });

    it('使用自定义延迟时长', async () => {
        let finished = false;
        const pending = delay(500).then(() => {
            finished = true;
        });

        await vi.advanceTimersByTimeAsync(499);
        expect(finished).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await pending;
        expect(finished).toBe(true);
    });
});
