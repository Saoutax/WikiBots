import Parser from 'wikiparser-node';
import { run, qwapi as api } from '@/api';
import { names } from '@/config/Internal_link_helper.json';
import { BotInstance } from '@/lib';
import { delay } from '@/utils';

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'qw' }, async () => {
        const pages = await bot.queryCategory(
            'Category:有蓝链却未移除内部链接助手模板的页面',
            false,
            ['page'],
        );

        const pageContent = await bot.batchQuery(pages, 500, 3, 5000);

        const selector = `template:is(#${names.join(', #')})`;
        for (const [title, { content, revid }] of Object.entries(pageContent)) {
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
                await delay();
                continue;
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
                await delay();
            }
        }
    });
})();
