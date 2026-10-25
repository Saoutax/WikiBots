import { run, vjpapi as api } from '@/api';
import { BotInstance } from '@/lib';

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'vjp' }, async () => {
        const {
            data: {
                query: {
                    querypage: { results },
                },
            },
        } = await api.post({
            action: 'query',
            list: 'querypage',
            qppage: 'DoubleRedirects',
            qplimit: 'max',
        });

        for (const {
            title,
            databaseResult: { c_namespace, c_title },
        } of results) {
            const text = `#REDIRECT [[:${c_title}]]${Number(c_namespace) === 14 ? `\n{{分类重定向|${c_title}}}` : ''}`;
            await bot.edit({
                title,
                text,
                tags: 'Bot',
                summary: '修复双重重定向',
            });
            console.log(`Done: ${title} → ${c_title}`);
        }
    });
})();
