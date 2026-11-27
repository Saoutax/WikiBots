import { createRateLimiter, getTimeData, updateTimeData, dayjs } from '@/infra';
import { BaseApi, BotInstance, collectRecentChanges } from '@/lib';
import { bump, formatCounts, stripInvisible } from '@/wikitext/invisibleCharacter';

interface PageMap {
    title: string;
    pageid: number;
    ns: number;
}

/**
 * 不处理的命名空间：他人用户页、界面消息与脚本。
 * 这些页面里的“不可见字符”往往是排版或代码的一部分，且不应由机器人代改。
 */
const SKIP_NAMESPACES = new Set([2, 3, 8, 230, 231]);

class InvisibleCharacter extends BaseApi {
    main = async (name: string, config?: string): Promise<void> => {
        const now = dayjs().tz(),
            rcstart = now.toISOString(),
            rcend = await getTimeData(name);

        const bot = new BotInstance(this.api);

        const pageids: number[] = [];
        if (config) {
            const result = await bot.getJson<{ pageids?: number[] }>(config);
            pageids.push(...(result?.pageids ?? []));
        }

        // 分页取全窗口内的更改，避免 rclimit=max 截断后旧记录被漏掉
        const changes: PageMap[] = [];
        await collectRecentChanges<PageMap>(
            this.api,
            {
                rcstart,
                rcend,
                rctag: 'invisibleCharacter',
                rcprop: 'title|ids',
                rcnamespace: '*',
                rctoponly: true,
                rclimit: 'max',
            },
            list => {
                changes.push(...list);
            },
        );

        const pages = new Set<string>();
        for (const { title, pageid, ns } of changes) {
            if (SKIP_NAMESPACES.has(ns) || pageids.includes(pageid)) {
                continue;
            }
            pages.add(title);
        }

        if (pages.size === 0) {
            console.log('No page need to process.');
            await updateTimeData(name, rcstart);
            return;
        }

        const content = await bot.batchQuery([...pages]),
            result: { title: string; text: string; revid: number; summary: string }[] = [],
            kept = new Map<string, number>();

        for (const [title, { content: text, revid }] of Object.entries(content)) {
            const { text: cleaned, removed, kept: pageKept } = stripInvisible(text);
            for (const [label, count] of pageKept) {
                bump(kept, label, count);
            }
            if (cleaned === text) {
                continue;
            }
            // 清理后整页为空说明原文只有不可见字符，宁可不动，也不清空页面
            if (cleaned.trim() === '') {
                console.warn(`Skip: ${title}（清理后页面为空）`);
                continue;
            }
            result.push({
                title,
                text: cleaned,
                revid,
                summary: `移除不可见字符（${formatCounts(removed)}）`,
            });
        }

        const failed: string[] = [],
            limiter = createRateLimiter();
        await limiter.map(result, async ({ title, text, revid, summary }) => {
            try {
                await bot.edit({
                    title,
                    text,
                    baserevid: revid,
                    summary,
                    tags: 'Bot',
                    nocreate: true,
                });
                console.log(`Done: ${title}`);
            } catch (error) {
                failed.push(title);
                console.error(`Failed: ${title}`, error instanceof Error ? error.message : error);
            }
        });

        if (kept.size > 0) {
            console.log(`Kept meaningful characters: ${formatCounts(kept)}`);
        }
        if (failed.length > 0) {
            console.error(`Failed to edit ${failed.length} page(s): ${failed.join(', ')}`);
        }

        // 个别页面失败也推进游标，避免整条任务因单页失败而永久卡在旧窗口
        await updateTimeData(name, rcstart);
    };
}

export { InvisibleCharacter };
