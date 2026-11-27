import Parser from 'wikiparser-node';
import { qwapi as api } from '@/api';
import { names } from '@/config/Internal_link_helper.json';
import { createRateLimiter } from '@/infra';
import { BotInstance } from '@/lib';
import { run } from '@/runner';

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'qw' }, async () => {
        const pages = await bot.queryCategory(
            'Category:有蓝链却未移除内部链接助手模板的页面',
            false,
            ['page'],
        );

        const pageContent = await bot.batchQuery(pages, 500, 3, 5000);
        const limiter = createRateLimiter({ concurrency: 1, interval: 3000, intervalCap: 1 });
        const selector = `template:is(#${names.join(', #')})`;

        await limiter.map(Object.entries(pageContent), async ([title, { content, revid }]) => {
            const root = Parser.parse(content),
                templates = root.querySelectorAll<Parser.TranscludeToken>(selector);

            if (templates.length === 0) {
                await bot.edit({
                    title,
                    appendtext: '',
                    baserevid: revid,
                    summary: '机器人：零编辑',
                });
                console.log(`NULLEDIT: ${title}`);
                return;
            }

            for (const template of templates) {
                const target = template.getValue(1),
                    display = template.getValue(3);
                template.replaceWith(`[[${target}${display ? `|${display}` : ''}]]`);
            }

            const newContent = root.toString();
            if (newContent !== content) {
                await bot.edit({
                    title,
                    text: newContent,
                    baserevid: revid,
                    summary: '机器人：移除已弃用模板',
                });
                console.log(`REPLACED: ${title}`);
            }
        });
    });
})();
