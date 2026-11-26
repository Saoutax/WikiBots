import { vi } from 'vitest';
import type { MediaWikiApi } from 'wiki-saikou';

type MockFn = ReturnType<typeof vi.fn>;

type Site = 'zh' | 'cm' | 'vjp' | 'uew' | 'qw' | 'elaina';

interface ApiStub {
    /** 可直接传给 BotInstance 或 archiveList 等函数的 API 实例 */
    api: MediaWikiApi;
    /** 对应 api.post：query、recentchanges、querypage 等请求 */
    post: MockFn;
    /** 对应 api.postWithToken：edit、delete、protect 等写请求 */
    postWithToken: MockFn;
    /** 对应 api.get：meta=siteinfo 等请求 */
    get: MockFn;
    /** 对应 api.login，脚本层 mock 的 run 不会调用 */
    login: MockFn;
}

/**
 * bot 脚本测试运行时。
 *
 * 状态放在 `vi.hoisted` 中，保证 `vi.mock` 工厂与测试文件共享同一份实例；
 * 测试通过 `vi.resetModules()` 重新执行脚本时状态仍然有效。
 */
const runtime = vi.hoisted(() => {
    const makeStub = (): ApiStub => {
        const post = vi.fn();
        const postWithToken = vi.fn();
        const get = vi.fn();
        const login = vi.fn();

        return {
            api: { post, postWithToken, get, login } as unknown as MediaWikiApi,
            post,
            postWithToken,
            get,
            login,
        };
    };

    const state = {
        stubs: {
            zh: makeStub(),
            cm: makeStub(),
            vjp: makeStub(),
            uew: makeStub(),
            qw: makeStub(),
            elaina: makeStub(),
        } as Record<Site, ApiStub>,
        /** 已登记的 run() 任务完成信号 */
        pending: [] as Promise<void>[],
        /** 已登记的 run() 调用参数 */
        targets: [] as unknown[],
        /** 任务抛出的异常 */
        errors: [] as unknown[],
        /** getTimeData 返回值 */
        timeData: '2026-01-01T00:00:00.000Z' as string | undefined,
        /** updateTimeData 调用记录 */
        timeDataUpdates: [] as [string, string][],
        enqueue(targets: unknown, task: () => Promise<void>): void {
            state.targets.push(targets);

            let done!: () => void;
            const promise = new Promise<void>(resolve => {
                done = resolve;
            });
            state.pending.push(promise);

            void (async () => {
                try {
                    await task();
                } catch (error) {
                    state.errors.push(error);
                } finally {
                    done();
                }
            })();
        },
        reset(): void {
            state.pending.length = 0;
            state.targets.length = 0;
            state.errors.length = 0;
            state.timeDataUpdates.length = 0;
            state.timeData = '2026-01-01T00:00:00.000Z';

            for (const stub of Object.values(state.stubs)) {
                stub.post.mockReset();
                stub.postWithToken.mockReset();
                stub.get.mockReset();
                stub.login.mockReset();
            }
        },
        async drain() {
            await Promise.all(state.pending);
            return {
                errors: [...state.errors],
                targets: [...state.targets],
                updates: [...state.timeDataUpdates],
            };
        },
    };

    return state;
});

vi.mock('@/api', () => ({
    zhapi: runtime.stubs['zh']!.api,
    cmapi: runtime.stubs['cm']!.api,
    vjpapi: runtime.stubs['vjp']!.api,
    uewapi: runtime.stubs['uew']!.api,
    qwapi: runtime.stubs['qw']!.api,
    elainaapi: runtime.stubs['elaina']!.api,
    Login: class {
        login = async () => ({ lgusername: 'Bot' });
    },
    // 与真实 run 的差异：不登录、不打印起止时间、不设置 process.exitCode，
    // 只登记任务执行结果，便于测试断言脚本行为。
    run: (targets: unknown, task: () => Promise<void>) => {
        runtime.enqueue(targets, task);
    },
}));

vi.mock('@/utils', async importOriginal => {
    const actual = await importOriginal<typeof import('@/utils')>();

    return {
        ...actual,
        // 避免真实等待
        delay: async () => {},
        createRateLimiter: () => ({
            run: <T>(fn: () => Promise<T>) => fn(),
            map: <T, R>(items: readonly T[], fn: (item: T, index: number) => Promise<R>) =>
                Promise.all(items.map((item, index) => fn(item, index))),
        }),
        // 隔离 GitHub 上的时间戳记录
        getTimeData: async () => runtime.timeData,
        updateTimeData: async (name: string, time: string) => {
            runtime.timeDataUpdates.push([name, time]);
        },
    };
});

/**
 * 由编辑请求体还原页面修改后的完整内容。
 *
 * - 全量编辑（带 `text`）直接返回新正文；
 * - 追加编辑（带 `appendtext`）拼接在修改前的内容之后，用于断言存档页的完整前后内容。
 *
 * @param body - postWithToken 的请求体
 * @param before - 修改前的完整页面内容
 * @returns 修改后的完整页面内容
 */
const editedPage = (body: { text?: unknown; appendtext?: unknown }, before = ''): string => {
    if (typeof body.text === 'string') {
        return body.text;
    }
    return `${before}${typeof body.appendtext === 'string' ? body.appendtext : ''}`;
};

export { runtime, editedPage };
export type { ApiStub, MockFn };
