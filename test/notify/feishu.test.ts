import { hostname } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyRun, readFeishuConfig, redact } from '@/notify/feishu';

const baseEnv: NodeJS.ProcessEnv = {
    GITHUB_ACTIONS: 'true',
    GITHUB_WORKFLOW: 'MGP daily',
    GITHUB_JOB: 'deleteRedirect',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: 'Saoutax/WikiBots',
    GITHUB_RUN_ID: '123456',
    FEISHU_APP_ID: 'cli_test_app',
    FEISHU_APP_SECRET: 'super_secret_app_value',
    FEISHU_RECEIVE_ID: 'oc_test_chat',
    FEISHU_RECEIVE_ID_TYPE: 'chat_id',
    ZH_BOT: 'wiki_bot_password_123',
};

describe('feishu', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('redact 会脱敏常见 token 前缀与敏感环境变量值', () => {
        const input = [
            'Authorization: Bearer abcdef12345678',
            'token=ghp_1234567890abcdef',
            'key=sk-1234567890',
            'secret=super_secret_app_value',
            'pass=wiki_bot_password_123',
        ].join('\n');

        const result = redact(input, baseEnv);

        expect(result).not.toContain('abcdef12345678');
        expect(result).not.toContain('ghp_1234567890abcdef');
        expect(result).not.toContain('sk-1234567890');
        expect(result).not.toContain('super_secret_app_value');
        expect(result).not.toContain('wiki_bot_password_123');
        expect(result).toContain('Bearer [REDACTED]');
    });

    it('readFeishuConfig 在缺少配置时返回 undefined，缺省 type 时按前缀推断', () => {
        expect(readFeishuConfig({})).toBeUndefined();
        expect(
            readFeishuConfig({
                FEISHU_APP_ID: 'cli_1',
                FEISHU_APP_SECRET: 'sec_1',
                FEISHU_RECEIVE_ID: 'oc_123',
            }),
        ).toEqual({
            appId: 'cli_1',
            appSecret: 'sec_1',
            receiveId: 'oc_123',
            receiveIdType: 'chat_id',
        });
    });

    it('未配置飞书凭据时不发起任何网络请求', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await notifyRun({
            ok: true,
            sites: ['zh'],
            durationMs: 1200,
            log: 'done',
            env: {},
        });

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('短日志仅获取 token 并发送互动卡片', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ code: 0, tenant_access_token: 't-token-1' })),
            )
            .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: {} })));
        vi.stubGlobal('fetch', fetchMock);

        await notifyRun({
            ok: true,
            sites: ['zh'],
            durationMs: 2500,
            log: 'Start\nEdited 1 page with super_secret_app_value\nEnd',
            env: baseEnv,
            notifierOptions: { retryDelayMs: 0 },
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        );
        expect(fetchMock.mock.calls[1]?.[0]).toBe(
            'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
        );

        const cardBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
        expect(cardBody.msg_type).toBe('interactive');
        expect(cardBody.receive_id).toBe('oc_test_chat');
        const card = JSON.parse(cardBody.content);
        expect(card.header.template).toBe('green');
        expect(card.header.title.content).toBe('任务成功 · MGP daily/deleteRedirect');
        expect(card.elements[0].tag).toBe('div');
        expect(card.elements[1].tag).toBe('hr');
        expect(card.elements[2].content).not.toContain('super_secret_app_value');
        expect(card.elements[3].actions[0].url).toBe(
            'https://github.com/Saoutax/WikiBots/actions/runs/123456',
        );
    });

    it('超长日志会额外上传 .log 文件并发送文件消息', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ code: 0, tenant_access_token: 't-token-2' })),
            )
            .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: {} })))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ code: 0, data: { file_key: 'file_v2_abc' } })),
            )
            .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: {} })));
        vi.stubGlobal('fetch', fetchMock);

        const longLog = Array.from({ length: 120 }, (_, i) => `log line ${i + 1}`).join('\n');
        await notifyRun({
            ok: false,
            sites: ['zh', 'cm'],
            durationMs: 65_000,
            log: longLog,
            env: baseEnv,
            notifierOptions: { retryDelayMs: 0 },
        });

        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(fetchMock.mock.calls[2]?.[0]).toBe('https://open.feishu.cn/open-apis/im/v1/files');
        const fileMsgBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body));
        expect(fileMsgBody.msg_type).toBe('file');
        expect(JSON.parse(fileMsgBody.content)).toEqual({ file_key: 'file_v2_abc' });
    });

    it('5xx 会重试，且通知最终失败只打 warning 不抛错', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response('server error', { status: 500 }))
            .mockResolvedValueOnce(new Response('server error', { status: 502 }))
            .mockResolvedValueOnce(new Response('server error', { status: 503 }))
            .mockResolvedValueOnce(new Response('server error', { status: 500 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            notifyRun({
                ok: false,
                sites: ['qw'],
                durationMs: 500,
                log: 'failed',
                env: baseEnv,
                notifierOptions: { maxRetries: 2, retryDelayMs: 0 },
            }),
        ).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('SERVER=true 时标题使用 hostname 与脚本名，为 false 时保持原逻辑', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ code: 0, tenant_access_token: 't-token-s1' })),
            )
            .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: {} })))
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ code: 0, tenant_access_token: 't-token-s2' })),
            )
            .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: {} })));
        vi.stubGlobal('fetch', fetchMock);

        await notifyRun({
            ok: true,
            sites: ['qw'],
            durationMs: 100,
            log: 'ok',
            env: { ...baseEnv, SERVER: 'true' },
            scriptPath: '/root/WikiBots/src/bot/qw/archiveTEA.ts',
            notifierOptions: { retryDelayMs: 0 },
        });

        await notifyRun({
            ok: true,
            sites: ['qw'],
            durationMs: 100,
            log: 'ok',
            env: { ...baseEnv, SERVER: 'false' },
            scriptPath: '/root/WikiBots/src/bot/qw/archiveTEA.ts',
            notifierOptions: { retryDelayMs: 0 },
        });

        const serverCard = JSON.parse(
            JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).content,
        );
        expect(serverCard.header.title.content).toBe(`任务成功 · ${hostname()}/qw/archiveTEA`);

        const ghaCard = JSON.parse(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body)).content);
        expect(ghaCard.header.title.content).toBe('任务成功 · MGP daily/deleteRedirect');
    });
});
