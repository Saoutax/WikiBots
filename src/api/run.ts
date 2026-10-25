import type { MediaWikiApi } from 'wiki-saikou';
import { Login } from './index';
import type { SiteAccount } from './types';

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
 */
const run = async (targets: BotTarget | BotTarget[], task: () => Promise<void>) => {
    const list = Array.isArray(targets) ? targets : [targets];

    console.log(`Start time: ${new Date().toISOString()}`);

    try {
        for (const { api, site, account = 'bot' } of list) {
            await new Login(api).login({ site, account });
        }
        await task();
    } catch (err) {
        console.error(`Failed to run task on ${list.map(({ site }) => site).join(', ')}:`);
        console.error(err);
        process.exitCode = 1;
    } finally {
        console.log(`End time: ${new Date().toISOString()}`);
    }
};

export { run };
