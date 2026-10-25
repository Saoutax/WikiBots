import Parser from 'wikiparser-node';
import { run, zhapi as api } from '@/api';
import { BotInstance } from '@/lib';
import type { PageContent } from '@/lib';
import { getTimeData, updateTimeData, dayjs } from '@/utils';
import { collectRecentChanges } from '../modules';

const bot = new BotInstance(api);

const getPages = async (rcstart: string, rcend: string | undefined) => {
    const titles = new Set<string>();

    await collectRecentChanges<{ title: string }>(
        api,
        {
            rcstart,
            rcend,
            rcnamespace: '0|10', // (main), Template
            rclimit: 'max',
        },
        list => {
            for (const page of list) {
                titles.add(page.title);
            }
        },
    );

    return [...titles];
};

(async () => {
    await run({ api, site: 'zh' }, async () => {
        const now = dayjs.tz(),
            rcstart = now.toISOString(),
            rcend = await getTimeData('removeExtraPipe');

        const pages = await getPages(rcstart, rcend),
            pageContent = await bot.batchQuery(pages);

        const modify: Record<string, PageContent> = {};
        for (const [title, { content, revid }] of Object.entries(pageContent)) {
            const parsed = Parser.parse(content),
                links = parsed.querySelectorAll<Parser.LinkToken>('link');
            for (const link of links) {
                // 暂时忽略带有锚点#的情况
                if (link.length === 1 || link.fragment) {
                    continue;
                }
                const { innerText } = link,
                    newLink = link.normalizeTitle(innerText);
                if (newLink.valid && !newLink.fragment && newLink.title === link.link.title) {
                    link.link = innerText;
                    link.innerText = undefined as unknown as string;
                }
            }

            const newContent = parsed.toString();
            if (newContent !== content) {
                modify[title] = { content: newContent, revid };
            }
        }

        for (const [title, { content: text, revid }] of Object.entries(modify)) {
            await bot.edit({
                title,
                text,
                baserevid: revid,
                summary: '移除多余管道符',
                tags: 'Bot',
            });
            console.log(`√ ${title}`);
        }

        await updateTimeData('removeExtraPipe', rcstart);
    });
})();
