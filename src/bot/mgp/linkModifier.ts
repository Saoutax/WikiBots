import Parser, { type LinkToken } from 'wikiparser-node';
import { zhapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';

interface Config {
    from: string;
    to: string;
    excludepages: string[];
    excludecategory: string[];
    extendsummary: string;
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'zh', account: 'bot' });

    const bot = new BotInstance(api);

    const { from, to, excludepages, excludecategory, extendsummary } = await bot.getJson<Config>(
        'User:SaoMikoto/Bot/config/linkModifier.json',
    );

    const exclude = [
        ...new Set([
            ...(await bot.queryCategory(excludecategory, false, ['page'])),
            ...excludepages,
        ]),
    ];

    const [linkPages] = Object.values(await bot.getLinked(from, [0, 10])),
        modify = linkPages!.filter(item => !exclude.includes(item)),
        pageContent = await bot.batchQuery(modify);

    const result: Record<string, string> = {};
    for (const [page, content] of Object.entries(pageContent)) {
        const parsed = Parser.parse(content),
            links = parsed.querySelectorAll<LinkToken>(`link[name="${from}"]`);
        for (const link of links) {
            const show = link.innerText === from;
            link.setTarget(to);
            if (show) {
                link.innerText = from;
            }
        }
        const newContent = parsed.toString();
        if (newContent !== content) {
            result[page] = newContent;
        }
    }

    console.log(`Total: ${Object.values(result).length}`);

    const summary = `替换链接：[[${from}]] → [[${to}]]${extendsummary ? `：${extendsummary}` : ''}`;
    for (const [title, text] of Object.entries(result)) {
        await api.postWithToken('csrf', {
            action: 'edit',
            title,
            text,
            tags: 'Bot',
            summary,
            bot: true,
            minor: true,
        });
        console.log(`Done: ${title}`);
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
