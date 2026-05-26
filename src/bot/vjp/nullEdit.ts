import { vjpapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';

interface Config {
    categories: string[];
    pages: string[];
}

const bot = new BotInstance(api);

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'vjp', account: 'bot' });

    const { categories, pages } = await bot.getJson<Config>(
        'User:SaoMikoto/bot/config/nullEdit.json',
    );

    const needEdit = [
        ...new Set([
            ...(await bot.queryCategory(categories, false, ['page', 'file', 'subcat'])),
            ...pages,
        ]),
    ];

    await Promise.all(
        needEdit.map(async title => {
            await api.postWithToken('csrf', {
                action: 'edit',
                title,
                appendtext: '',
                summary: '批量空编辑',
                tags: 'Bot',
                minor: true,
                bot: true,
                nocreate: true,
            });
            console.log(`Done: ${title}`);
        }),
    );

    console.log(`End time: ${new Date().toISOString()}`);
})();
