import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '@/infra/rateLimit';

describe('createRateLimiter', () => {
    it('按顺序映射所有元素并保留返回值', async () => {
        const limiter = createRateLimiter({ concurrency: 2, interval: 0 });
        const result = await limiter.map([1, 2, 3], async (n, idx) => n * 10 + idx);

        expect(result).toEqual([10, 21, 32]);
    });

    it('限制同时执行的任务数不超过 concurrency', async () => {
        const limiter = createRateLimiter({ concurrency: 2, interval: 0 });
        let active = 0;
        let maxActive = 0;

        await limiter.map([1, 2, 3, 4, 5], async () => {
            active++;
            maxActive = Math.max(maxActive, active);
            await Promise.resolve();
            active--;
        });

        expect(maxActive).toBeLessThanOrEqual(2);
    });
});
