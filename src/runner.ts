import type { MediaWikiApi } from 'wiki-saikou';
import { Login } from '@/api/login';
import type { SiteAccount } from '@/api/types';
import { startLogCapture } from '@/infra/logCapture';
import { notifyRun } from '@/notify/feishu';

interface BotTarget {
    api: MediaWikiApi;
    site: SiteAccount['site'];
    account?: SiteAccount['account'];
}

/**
 * 统一机器人脚本入口
 *
 * @param targets - 单个或多个登录目标
 * @param task - 任务体
 * @param notify - 是否在任务结束时推送飞书通知，默认 false
 */
const run = async (
    targets: BotTarget | BotTarget[],
    task: () => Promise<void>,
    notify = false,
): Promise<void> => {
    const list = Array.isArray(targets) ? targets : [targets];
    const capture = notify ? startLogCapture() : undefined;
    const startedAt = Date.now();
    let ok = true;

    console.log(`Start time: ${new Date().toISOString()}`);

    try {
        for (const { api, site, account = 'bot' } of list) {
            await new Login(api).login({ site, account });
        }
        await task();
    } catch (err) {
        ok = false;
        console.error(`Failed to run task on ${list.map(({ site }) => site).join(', ')}:`);
        console.error(err);
        process.exitCode = 1;
    } finally {
        console.log(`End time: ${new Date().toISOString()}`);
        if (notify && capture) {
            await notifyRun({
                ok,
                sites: list.map(({ site }) => site),
                durationMs: Date.now() - startedAt,
                log: capture.text(),
            });
            capture.restore();
        }
    }
};

export { run };
