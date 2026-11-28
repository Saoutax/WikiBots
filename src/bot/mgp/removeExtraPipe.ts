import Parser from 'wikiparser-node';
import { zhapi as api } from '@/api';
import { createRateLimiter, getTimeData, updateTimeData, dayjs } from '@/infra';
import { BotInstance, collectRecentChanges } from '@/lib';
import { run } from '@/runner';

const bot = new BotInstance(api);

const getPages = async (rcstart: string, rcend: string | undefined): Promise<string[]> => {
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

        const edits: { title: string; text: string; revid: number }[] = [];
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

            const text = parsed.toString();
            if (text !== content) {
                edits.push({ title, text, revid });
            }
        }
        console.log(
            `Window ${rcend ?? 'initial'} ~ ${rcstart}: scanned ${pages.length} page(s), ${edits.length} page(s) to fix.`,
        );

        const limiter = createRateLimiter();
        await limiter.map(edits, async ({ title, text, revid }) => {
            await bot.edit({
                title,
                text,
                baserevid: revid,
                summary: '移除多余管道符',
                tags: 'Bot',
            });
            console.log(`√ ${title}`);
        });
        console.log(
            edits.length > 0
                ? `Completed: fixed ${edits.length} page(s).`
                : 'No pages need to be fixed.',
        );

        await updateTimeData('removeExtraPipe', rcstart);
    });
})();
