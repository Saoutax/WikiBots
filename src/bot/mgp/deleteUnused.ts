import { zhapi, cmapi, Login } from '@/api';
import { BotInstance } from '@/lib';
import { booleanFilter } from '@/utils';

interface Config {
    categories: string[];
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(zhapi).login({ site: 'zh', account: 'bot' });
    const { lgusername } = await new Login(cmapi).login({ site: 'cm', account: 'bot' });

    const zhbot = new BotInstance(zhapi),
        cmbot = new BotInstance(cmapi);

    const { categories } = (await zhbot.getJson(
        'User:SaoMikoto/Bot/config/deleteUnused.json',
    )) as Config;

    const files = await cmbot.queryCategory(categories, true, ['file']),
        unlink = await cmbot.queryCategory('Category:非链入使用的文件', false, ['file']);

    const { isFalse } = booleanFilter(await cmbot.checkGlobalUsage(files)),
        needDel = isFalse.filter(item => !unlink.includes(item));

    await cmbot.flagDelete(needDel, '无使用或不再使用的文件', lgusername).then(console.log);

    console.log(`End time: ${new Date().toISOString()}`);
})();
