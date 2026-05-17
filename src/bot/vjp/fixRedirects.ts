import Parser, { type CategoryToken } from 'wikiparser-node';
import { vjpapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';
import { splitAndJoin } from '@/utils';

const bot = new BotInstance(api);

interface Redirects {
    from: string;
    to: string;
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'vjp', account: 'bot' });

    const original = await bot.queryCategory('Category:尚未清空的已重定向分类', false, ['subcat']);

    for (const titles of splitAndJoin(original)) {
        const {
            data: {
                query: { redirects },
            },
        } = await api.post({
            action: 'query',
            titles,
            redirects: true,
        });

        for (const { from, to } of (redirects ?? []) as Redirects[]) {
            const pages = await bot.queryCategory(from, false, ['file', 'page', 'subcat']),
                pageContent = await bot.batchQuery(pages);
            const result: Record<string, string> = {};

            for (const [title, content] of Object.entries(pageContent)) {
                const root = Parser.parse(content),
                    targets = root.querySelectorAll<CategoryToken>(`category[name="${from}"]`);
                targets.forEach(oldCat => oldCat.setTarget(to));
                const newContent = root.toString();
                if (content !== newContent) {
                    result[title] = newContent;
                }
            }

            for (const [title, text] of Object.entries(result)) {
                await api.postWithToken('csrf', {
                    action: 'edit',
                    title,
                    text,
                    summary: `修复分类重定向：[[${from}]] → [[${to}]]`,
                    tags: 'Bot',
                    minor: true,
                    bot: true,
                });
                console.log(`${title}: ${from} → ${to}`);
            }
        }
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
