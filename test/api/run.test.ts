import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import config from '@/api/config';
import { run } from '@/api/run';
import { createApiStub } from '../helpers/api';

describe('run', () => {
    let savedExitCode: typeof process.exitCode;

    beforeEach(() => {
        savedExitCode = process.exitCode;
    });

    afterEach(() => {
        process.exitCode = savedExitCode;
        vi.restoreAllMocks();
    });

    it('单个目标登录后执行 task 并输出起止时间', async () => {
        const stub = createApiStub();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const task = vi.fn().mockResolvedValue(undefined);
        stub.login.mockResolvedValue({ lgusername: '机娘亚衣琴@saoutaxbot' });

        await run({ api: stub.api, site: 'zh' }, task);

        expect(stub.login).toHaveBeenCalledWith(
            config.zh.accounts['bot']?.name,
            config.zh.accounts['bot']?.password,
            undefined,
            { retry: 25, noCache: true },
        );
        expect(task).toHaveBeenCalledTimes(1);
        expect(process.exitCode).toBe(savedExitCode);
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/^Start time: /));
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/^End time: /));
    });

    it('多个目标按顺序登录后再执行 task', async () => {
        const zh = createApiStub(),
            vjp = createApiStub();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const order: string[] = [];
        zh.login.mockImplementation(async () => {
            order.push('zh');
            return { lgusername: 'zh-bot' };
        });
        vjp.login.mockImplementation(async () => {
            order.push('vjp');
            return { lgusername: 'vjp-main' };
        });
        const task = vi.fn(async () => {
            order.push('task');
        });

        await run(
            [
                { api: zh.api, site: 'zh' },
                { api: vjp.api, site: 'vjp', account: 'main' },
            ],
            task,
        );

        expect(order).toEqual(['zh', 'vjp', 'task']);
        expect(zh.login).toHaveBeenCalledTimes(1);
        expect(vjp.login).toHaveBeenCalledWith(
            config.vjp.accounts['main']?.name,
            config.vjp.accounts['main']?.password,
            undefined,
            { retry: 25, noCache: true },
        );
        expect(task).toHaveBeenCalledTimes(1);
    });

    it('登录失败时设置 process.exitCode=1 且不执行 task', async () => {
        const stub = createApiStub();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const task = vi.fn();
        stub.login.mockRejectedValue(new Error('login failed'));

        await run({ api: stub.api, site: 'zh' }, task);

        expect(process.exitCode).toBe(1);
        expect(task).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith('Failed to run task on zh:');
    });

    it('task 抛错时设置 process.exitCode=1 且仍输出结束时间', async () => {
        const stub = createApiStub();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        stub.login.mockResolvedValue({ lgusername: '机娘亚衣琴@saoutaxbot' });
        const task = vi.fn().mockRejectedValue(new Error('task failed'));

        await run({ api: stub.api, site: 'zh' }, task);

        expect(process.exitCode).toBe(1);
        expect(task).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledWith(expect.stringMatching(/^End time: /));
    });

    it('默认不开启飞书通知时不会发起网络请求', async () => {
        const stub = createApiStub();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        stub.login.mockResolvedValue({ lgusername: '机娘亚衣琴@saoutaxbot' });
        const task = vi.fn().mockResolvedValue(undefined);
        const fetchMock = vi.fn();

        vi.stubEnv('FEISHU_APP_ID', 'cli_test');
        vi.stubEnv('FEISHU_APP_SECRET', 'secret_test');
        vi.stubEnv('FEISHU_RECEIVE_ID', 'oc_test');
        vi.stubGlobal('fetch', fetchMock);

        try {
            await run({ api: stub.api, site: 'zh' }, task);

            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllEnvs();
            vi.unstubAllGlobals();
        }
    });

    it('开启通知且飞书请求失败时不影响任务退出码', async () => {
        const stub = createApiStub();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        stub.login.mockResolvedValue({ lgusername: '机娘亚衣琴@saoutaxbot' });
        const task = vi.fn().mockResolvedValue(undefined);

        vi.stubEnv('FEISHU_APP_ID', 'cli_test');
        vi.stubEnv('FEISHU_APP_SECRET', 'secret_test');
        vi.stubEnv('FEISHU_RECEIVE_ID', 'oc_test');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

        try {
            await run({ api: stub.api, site: 'zh' }, task, true);

            expect(process.exitCode).toBe(savedExitCode);
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllEnvs();
            vi.unstubAllGlobals();
        }
    });
});
