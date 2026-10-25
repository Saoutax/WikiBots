import Parser from 'wikiparser-node';
import { run, zhapi as api } from '@/api';
import { BotInstance } from '@/lib';
import type { PageContent } from '@/lib';

interface Config {
    from: string;
    to: string;
    excludepages: string[];
    excludecategory: string[];
    extendsummary: string;
}

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'zh' }, async () => {
        const { from, to, excludepages, excludecategory, extendsummary } =
            await bot.getJson<Config>('User:SaoMikoto/Bot/config/linkModifier.json');

        const exclude = [
            ...new Set([
                ...(await bot.queryCategory(excludecategory, false, ['page'])),
                ...excludepages,
            ]),
        ];

        const [linkPages] = Object.values(await bot.getLinked(from, [0, 10])),
            modify = linkPages!.filter(item => !exclude.includes(item)),
            pageContent = await bot.batchQuery(modify);

        const result: Record<string, PageContent> = {};
        for (const [page, { content, revid }] of Object.entries(pageContent)) {
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
            const newContent = parsed.toString();
            if (newContent !== content) {
                result[page] = { content: newContent, revid };
            }
        }

        console.log(`Total: ${Object.values(result).length}`);

        const summary = `替换链接：[[${from}]] → [[${to}]]${extendsummary ? `：${extendsummary}` : ''}`;
        for (const [title, { content: text, revid }] of Object.entries(result)) {
            await bot.edit({ title, text, baserevid: revid, summary, tags: 'Bot' });
            console.log(`Done: ${title}`);
        }
    });
})();
