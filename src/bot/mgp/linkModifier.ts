import Parser from 'wikiparser-node';
import { z } from 'zod';
import { run, zhapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { createRateLimiter } from '@/utils';

const configSchema = z.object({
    from: z.string(),
    to: z.string(),
    excludepages: z.array(z.string()),
    excludecategory: z.array(z.string()),
    extendsummary: z.string(),
});

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'zh' }, async () => {
        const { from, to, excludepages, excludecategory, extendsummary } = await bot.getJson(
            'User:SaoMikoto/Bot/config/linkModifier.json',
            configSchema,
        );

        const exclude = new Set([
            ...(await bot.queryCategory(excludecategory, false, ['page'])),
            ...excludepages,
        ]);

        const [linkPages] = Object.values(await bot.getLinked(from, [0, 10])),
            modify = linkPages!.filter(item => !exclude.has(item)),
            pageContent = await bot.batchQuery(modify);

        const edits: { title: string; text: string; revid: number }[] = [];
        for (const [title, { content, revid }] of Object.entries(pageContent)) {
            const parsed = Parser.parse(content),
                links = parsed.querySelectorAll<Parser.LinkToken>(`link[name="${from}"]`);
            for (const link of links) {
                const show = link.innerText === from;
                const fragment = link.fragment;
                link.setTarget(to);
                if (fragment !== undefined) {
                    link.fragment = fragment;
                }
                if (show) {
                    link.innerText = from;
                }
            }
            const text = parsed.toString();
            if (text !== content) {
                edits.push({ title, text, revid });
            }
        }

        console.log(`Total: ${edits.length}`);

        const summary = `替换链接：[[${from}]] → [[${to}]]${extendsummary ? `：${extendsummary}` : ''}`;
        const limiter = createRateLimiter();
        await limiter.map(edits, async ({ title, text, revid }) => {
            await bot.edit({ title, text, baserevid: revid, summary, tags: 'Bot' });
            console.log(`Done: ${title}`);
        });
    });
})();
