import { qwapi as api } from '@/api';
import { delay } from '@/infra';
import { BotInstance } from '@/lib';
import { run } from '@/runner';

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'qw' }, async () => {
        const pages = await bot.queryCategory(`Category:${process.env.CATEGORY}`, false, [
            'page',
            'file',
            'subcat',
        ]);
        console.log(`Category:${process.env.CATEGORY}: ${pages.length} page(s) to null-edit.`);

        for (const title of pages) {
            await bot.edit({
                title,
                appendtext: '',
                summary: '机器人：零编辑',
            });
            console.log(`NULLEDIT: ${title}`);
            await delay();
        }
        console.log(`Completed: ${pages.length} page(s) null-edited.`);
    });
})();
