import { qwapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';
import 'dotenv/config';

const bot = new BotInstance(api);

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'qw', account: 'bot' });

    const pages = await bot.queryCategory(`Category:${process.env.CATEGORY}`, false, ['page']);

    await Promise.all(
        pages.map(async title => {
            await api.postWithToken('csrf', {
                action: 'edit',
                title,
                appendtext: '',
                summary: '机器人：零编辑',
                minor: true,
                bot: true,
            });
            console.log(`NULLEDIT: ${title}`);
        }),
    );

    console.log(`End time: ${new Date().toISOString()}`);
})();
