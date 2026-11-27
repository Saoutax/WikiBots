import type { ApiDeleteResponse } from 'types-mediawiki-response';
import { z } from 'zod';
import { zhapi, cmapi } from '@/api';
import { booleanFilter, createRateLimiter } from '@/infra';
import { BotInstance } from '@/lib';
import { run } from '@/runner';

const configSchema = z.object({
    categories: z.array(z.string()),
});

(async () => {
    await run(
        [
            { api: zhapi, site: 'zh' },
            { api: cmapi, site: 'cm' },
        ],
        async () => {
            const zhbot = new BotInstance(zhapi),
                cmbot = new BotInstance(cmapi);

            const { categories } = await zhbot.getJson(
                'User:SaoMikoto/Bot/config/deleteUnused.json',
                configSchema,
            );

            const files = await cmbot.queryCategory(categories, true, ['file']),
                unlink = await cmbot.queryCategory('Category:非链入使用的文件', false, ['file']);

            const { isFalse } = booleanFilter(await cmbot.checkGlobalUsage(files)),
                needDel = isFalse.filter(item => !unlink.includes(item)),
                limiter = createRateLimiter();

            await limiter.map(needDel, async title => {
                await cmapi.postWithToken<ApiDeleteResponse>('csrf', {
                    action: 'delete',
                    title,
                    reason: '无使用或不再使用的文件',
                    tags: 'Bot',
                    bot: true,
                });
            });

            console.log(needDel.length > 0 ? 'All unused deleted.' : 'No file need to delete.');
        },
    );
})();
