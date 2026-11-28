import { vjpapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { run } from '@/runner';

interface Config {
    categories: string[];
    pages: string[];
}

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'vjp' }, async () => {
        const { categories, pages } = await bot.getJson<Config>(
            'User:SaoMikoto/Bot/config/nullEdit.json',
        );

        const needEdit = [
            ...new Set([
                ...(await bot.queryCategory(categories, false, ['page', 'file', 'subcat'])),
                ...pages,
            ]),
        ];
        console.log(`Found ${needEdit.length} page(s) to null-edit.`);

        await Promise.all(
            needEdit.map(async title => {
                await bot.edit({
                    title,
                    appendtext: '',
                    summary: '批量空编辑',
                    tags: 'Bot',
                    nocreate: true,
                });
                console.log(`Done: ${title}`);
            }),
        );
        if (needEdit.length > 0) {
            console.log(`Completed: ${needEdit.length} page(s) null-edited.`);
        }
    });
})();
