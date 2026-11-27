import PQueue from 'p-queue';

interface RateLimitOptions {
    /** 最大并发数，默认为 3 */
    concurrency?: number;
    /** 限速时间窗口（毫秒），默认为 1000 */
    interval?: number;
    /** 每个时间窗口内允许启动的最大任务数，默认为 2 */
    intervalCap?: number;
}

interface RateLimiter {
    /** 将单个异步任务加入限速队列执行 */
    run: <T>(fn: () => Promise<T>) => Promise<T>;
    /** 按限速队列并发映射数组 */
    map: <T, R>(items: readonly T[], fn: (item: T, index: number) => Promise<R>) => Promise<R[]>;
}

/**
 * 创建基于时间窗口与并发上限的速率限制器
 *
 * @param options - 并发与时间窗口配置
 * @returns 速率限制器实例
 */
const createRateLimiter = ({
    concurrency = 3,
    interval = 1000,
    intervalCap = 2,
}: RateLimitOptions = {}): RateLimiter => {
    const queue = new PQueue(
        interval > 0 ? { concurrency, interval, intervalCap } : { concurrency },
    );

    const run = <T>(fn: () => Promise<T>): Promise<T> => queue.add(fn) as Promise<T>;

    const map = <T, R>(
        items: readonly T[],
        fn: (item: T, index: number) => Promise<R>,
    ): Promise<R[]> => Promise.all(items.map((item, index) => run(() => fn(item, index))));

    return { run, map };
};

export { createRateLimiter };
export type { RateLimitOptions, RateLimiter };
