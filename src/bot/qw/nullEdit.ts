import { run, qwapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { delay } from '@/utils';

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'qw' }, async () => {
        const pages = await bot.queryCategory(`Category:${process.env.CATEGORY}`, false, [
            'page',
            'file',
            'subcat',
        ]);

        for (const title of pages) {
            await bot.edit({
                title,
                appendtext: '',
                summary: '机器人：零编辑',
            });
            console.log(`NULLEDIT: ${title}`);
            await delay();
        }
    });
})();
