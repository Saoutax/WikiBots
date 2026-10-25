import { run, zhapi, cmapi } from '@/api';
import { BotInstance } from '@/lib';
import { booleanFilter } from '@/utils';

interface Config {
    categories: string[];
}

(async () => {
    await run(
        [
            { api: zhapi, site: 'zh' },
            { api: cmapi, site: 'cm' },
        ],
        async () => {
            const zhbot = new BotInstance(zhapi),
                cmbot = new BotInstance(cmapi);

            const { categories } = await zhbot.getJson<Config>(
                'User:SaoMikoto/Bot/config/deleteUnused.json',
            );

            const files = await cmbot.queryCategory(categories, true, ['file']),
                unlink = await cmbot.queryCategory('Category:非链入使用的文件', false, ['file']);

            const { isFalse } = booleanFilter(await cmbot.checkGlobalUsage(files)),
                needDel = isFalse.filter(item => !unlink.includes(item));

            await Promise.all(
                needDel.map(async title => {
                    await cmapi.postWithToken('csrf', {
                        action: 'delete',
                        title,
                        reason: '无使用或不再使用的文件',
                        tags: 'Bot',
                        bot: true,
                    });
                }),
            );

            console.log(needDel.length > 0 ? 'All unused deleted.' : 'No file need to delete.');
        },
    );
})();
