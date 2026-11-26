import { hostname } from 'node:os';
import { basename } from 'node:path';
import type { SiteAccount } from '@/api/types';

type ReceiveIdType = 'open_id' | 'chat_id' | 'user_id' | 'union_id' | 'email';

interface FeishuConfig {
    appId: string;
    appSecret: string;
    receiveId: string;
    receiveIdType: ReceiveIdType;
}

interface FeishuNotifierOptions {
    config: FeishuConfig;
    /** 单次请求超时毫秒数，默认 10000 */
    timeoutMs?: number;
    /** 5xx 或网络错误时的重试次数，默认 3 */
    maxRetries?: number;
    /** 重试基础退避毫秒数，默认 300 */
    retryDelayMs?: number;
}

interface NotifyRunParams {
    ok: boolean;
    sites: SiteAccount['site'][];
    durationMs: number;
    log: string;
    env?: NodeJS.ProcessEnv;
    scriptPath?: string;
    notifierOptions?: Omit<FeishuNotifierOptions, 'config'>;
}

const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';
const CARD_LOG_MAX_LINES = 80;
const CARD_LOG_MAX_BYTES = 6 * 1024;
const SENSITIVE_ENV_KEY_PATTERN = /(?:SECRET|TOKEN|PASSWORD|BOT|MAIN|_CF)$/i;

const VALID_RECEIVE_ID_TYPES = new Set<ReceiveIdType>([
    'open_id',
    'chat_id',
    'user_id',
    'union_id',
    'email',
]);

/**
 * 脱敏日志中的常见 Token 与敏感环境变量值
 */
const redact = (text: string, env: NodeJS.ProcessEnv = process.env): string => {
    let masked = text
        .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/g, '$1[REDACTED]')
        .replace(/\b(?:sk-|ghp_|ghs_)[A-Za-z0-9._-]{6,}/g, '[REDACTED]');

    const secrets = Object.entries(env)
        .filter(
            ([key, value]) =>
                SENSITIVE_ENV_KEY_PATTERN.test(key) &&
                typeof value === 'string' &&
                value.length >= 6,
        )
        .map(([, value]) => value!)
        .sort((a, b) => b.length - a.length);

    for (const secret of secrets) {
        masked = masked.replaceAll(secret, '[REDACTED]');
    }

    return masked;
};

/**
 * 从环境变量读取飞书配置；未配置完整时返回 undefined
 */
const readFeishuConfig = (env: NodeJS.ProcessEnv = process.env): FeishuConfig | undefined => {
    const appId = env.FEISHU_APP_ID?.trim();
    const appSecret = env.FEISHU_APP_SECRET?.trim();
    const receiveId = env.FEISHU_RECEIVE_ID?.trim();

    if (!appId || !appSecret || !receiveId) {
        return undefined;
    }

    const rawType = env.FEISHU_RECEIVE_ID_TYPE?.trim() as ReceiveIdType | undefined;
    const receiveIdType =
        rawType && VALID_RECEIVE_ID_TYPES.has(rawType)
            ? rawType
            : receiveId.startsWith('oc_')
              ? 'chat_id'
              : 'open_id';

    return {
        appId,
        appSecret,
        receiveId,
        receiveIdType,
    };
};

/**
 * 截取日志尾部（同时满足行数与字节数上限）
 */
const tailLog = (
    text: string,
    maxLines = CARD_LOG_MAX_LINES,
    maxBytes = CARD_LOG_MAX_BYTES,
): { tail: string; truncated: boolean } => {
    const trimmed = text.trimEnd();
    if (!trimmed) {
        return { tail: '(无日志输出)', truncated: false };
    }

    const allLines = trimmed.split(/\r?\n/);
    const sliced = allLines.slice(-maxLines);
    let truncated = allLines.length > maxLines;

    while (sliced.length > 1 && Buffer.byteLength(sliced.join('\n'), 'utf8') > maxBytes) {
        sliced.shift();
        truncated = true;
    }

    let tail = sliced.join('\n');
    if (Buffer.byteLength(tail, 'utf8') > maxBytes) {
        const buf = Buffer.from(tail, 'utf8');
        tail = buf.subarray(buf.length - maxBytes).toString('utf8');
        truncated = true;
    }

    return { tail, truncated };
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 飞书开放平台消息与文件推送客户端
 */
class FeishuNotifier {
    #config: FeishuConfig;
    #timeoutMs: number;
    #maxRetries: number;
    #retryDelayMs: number;

    constructor({
        config,
        timeoutMs = 10_000,
        maxRetries = 3,
        retryDelayMs = 300,
    }: FeishuNotifierOptions) {
        this.#config = config;
        this.#timeoutMs = timeoutMs;
        this.#maxRetries = maxRetries;
        this.#retryDelayMs = retryDelayMs;
    }

    async #requestJson<T>(url: string, init: RequestInit): Promise<T> {
        let lastError: unknown;

        for (let attempt = 0; attempt <= this.#maxRetries; attempt++) {
            try {
                const res = await fetch(url, {
                    ...init,
                    signal: AbortSignal.timeout(this.#timeoutMs),
                });

                if (res.status >= 500 && attempt < this.#maxRetries) {
                    await sleep(this.#retryDelayMs * 2 ** attempt);
                    continue;
                }

                const data = (await res.json()) as { code?: number; msg?: string } & T;
                if (!res.ok || (typeof data.code === 'number' && data.code !== 0)) {
                    throw new Error(
                        `Feishu API error (${res.status}): code=${data.code ?? 'unknown'} msg=${data.msg ?? res.statusText}`,
                    );
                }

                return data;
            } catch (error) {
                lastError = error;
                const isHttpClientError =
                    error instanceof Error && error.message.startsWith('Feishu API error (4');
                if (isHttpClientError || attempt >= this.#maxRetries) {
                    throw error;
                }
                await sleep(this.#retryDelayMs * 2 ** attempt);
            }
        }

        throw lastError;
    }

    async getToken(): Promise<string> {
        const data = await this.#requestJson<{ tenant_access_token?: string }>(
            `${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app_id: this.#config.appId,
                    app_secret: this.#config.appSecret,
                }),
            },
        );

        if (!data.tenant_access_token) {
            throw new Error('Feishu API error: missing tenant_access_token');
        }

        return data.tenant_access_token;
    }

    async sendCard(token: string, card: Record<string, unknown>): Promise<void> {
        const query = `receive_id_type=${encodeURIComponent(this.#config.receiveIdType)}`;

        await this.#requestJson(`${FEISHU_BASE_URL}/im/v1/messages?${query}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                receive_id: this.#config.receiveId,
                msg_type: 'interactive',
                content: JSON.stringify(card),
            }),
        });
    }

    async uploadLog(token: string, fileName: string, content: string): Promise<string> {
        const form = new FormData();
        form.append('file_type', 'stream');
        form.append('file_name', fileName);
        form.append('file', new Blob([content], { type: 'text/plain; charset=utf-8' }), fileName);

        const data = await this.#requestJson<{ data?: { file_key?: string } }>(
            `${FEISHU_BASE_URL}/im/v1/files`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: form,
            },
        );

        const fileKey = data.data?.file_key;
        if (!fileKey) {
            throw new Error('Feishu API error: missing file_key');
        }

        return fileKey;
    }

    async sendFile(token: string, fileKey: string): Promise<void> {
        const query = `receive_id_type=${encodeURIComponent(this.#config.receiveIdType)}`;

        await this.#requestJson(`${FEISHU_BASE_URL}/im/v1/messages?${query}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                receive_id: this.#config.receiveId,
                msg_type: 'file',
                content: JSON.stringify({ file_key: fileKey }),
            }),
        });
    }
}

const formatDuration = (durationMs: number): string => {
    if (durationMs < 1000) {
        return `${durationMs}ms`;
    }
    const seconds = durationMs / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remain = (seconds % 60).toFixed(1);
    return `${minutes}m ${remain}s`;
};

/**
 * 构建飞书互动卡片
 */
const buildRunCard = ({
    ok,
    title,
    sites,
    durationMs,
    tail,
    truncated,
    runUrl,
}: {
    ok: boolean;
    title: string;
    sites: string[];
    durationMs: number;
    tail: string;
    truncated: boolean;
    runUrl?: string;
}): Record<string, unknown> => {
    const safeTail = tail.replaceAll('```', "'''");
    const statusLabel = ok ? '成功' : '失败';

    const elements: Record<string, unknown>[] = [
        {
            tag: 'div',
            fields: [
                {
                    is_short: true,
                    text: {
                        tag: 'lark_md',
                        content: `**站点**\n${sites.join(', ') || '-'}`,
                    },
                },
                {
                    is_short: true,
                    text: {
                        tag: 'lark_md',
                        content: `**耗时**\n${formatDuration(durationMs)}`,
                    },
                },
            ],
        },
        {
            tag: 'hr',
        },
        ...(truncated
            ? [
                  {
                      tag: 'note',
                      elements: [
                          {
                              tag: 'plain_text',
                              content: '日志过长，完整日志已作为 .log 文件附件发送',
                          },
                      ],
                  },
              ]
            : []),
        {
            tag: 'markdown',
            content: `\`\`\`text\n${safeTail}\n\`\`\``,
        },
    ];

    if (runUrl) {
        elements.push({
            tag: 'action',
            actions: [
                {
                    tag: 'button',
                    text: {
                        tag: 'plain_text',
                        content: '查看 Actions 日志',
                    },
                    type: ok ? 'default' : 'danger',
                    url: runUrl,
                },
            ],
        });
    }

    return {
        header: {
            template: ok ? 'green' : 'red',
            title: {
                tag: 'plain_text',
                content: `任务${statusLabel} · ${title}`,
            },
        },
        elements,
    };
};

const resolveScriptName = (scriptPath = process.argv[1]): string | undefined => {
    if (!scriptPath) {
        return undefined;
    }

    const match = /src[/\\]bot[/\\]([^/\\]+)[/\\]([^/\\]+)\.[cm]?[jt]s$/i.exec(scriptPath);
    if (match) {
        return `${match[1]}/${match[2]}`;
    }

    return basename(scriptPath).replace(/\.[^.]+$/, '') || undefined;
};

const resolveRunTitle = (
    sites: SiteAccount['site'][],
    env: NodeJS.ProcessEnv,
    scriptPath?: string,
): string => {
    if (env.SERVER?.trim().toLowerCase() === 'true') {
        const script = resolveScriptName(scriptPath) ?? (sites.join(',') || 'unknown');
        return `${hostname()}/${script}`;
    }

    const workflow = env.GITHUB_WORKFLOW?.trim();
    const job = env.GITHUB_JOB?.trim();
    return workflow && job ? `${workflow}/${job}` : workflow || job || `local/${sites.join(',')}`;
};

/**
 * 在任务结束时向飞书推送运行摘要与日志；任何异常仅打印 warning，不改变退出码
 */
const notifyRun = async ({
    ok,
    sites,
    durationMs,
    log,
    env = process.env,
    scriptPath,
    notifierOptions,
}: NotifyRunParams): Promise<void> => {
    const config = readFeishuConfig(env);
    if (!config) {
        return;
    }

    const title = resolveRunTitle(sites, env, scriptPath);

    const serverUrl = env.GITHUB_SERVER_URL?.trim() || 'https://github.com';
    const repo = env.GITHUB_REPOSITORY?.trim();
    const runId = env.GITHUB_RUN_ID?.trim();
    const runUrl = repo && runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : undefined;

    const redacted = redact(log, env);
    const { tail, truncated } = tailLog(redacted);

    const card = buildRunCard({
        ok,
        title,
        sites,
        durationMs,
        tail,
        truncated,
        ...(runUrl ? { runUrl } : {}),
    });

    const notifier = new FeishuNotifier({ config, ...notifierOptions });

    try {
        const token = await notifier.getToken();
        await notifier.sendCard(token, card);

        if (truncated) {
            const safeName = title.replaceAll(/[^A-Za-z0-9._-]+/g, '_');
            const fileKey = await notifier.uploadLog(token, `${safeName}.log`, redacted);
            await notifier.sendFile(token, fileKey);
        }
    } catch (error) {
        console.warn('Failed to send Feishu notification:', error);
    }
};

export { FeishuNotifier, buildRunCard, notifyRun, readFeishuConfig, redact, tailLog };
export type { FeishuConfig, FeishuNotifierOptions, NotifyRunParams, ReceiveIdType };
