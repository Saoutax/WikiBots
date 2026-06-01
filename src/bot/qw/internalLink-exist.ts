import Parser, { type TranscludeToken } from 'wikiparser-node';
import { qwapi as api, Login } from '@/api';
import { names } from '@/config/Internal_link_helper.json';
import { BotInstance } from '@/lib';
import { delay } from '@/utils';

const bot = new BotInstance(api);

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'qw', account: 'bot' });

    const pages = await bot.queryCategory('Category:有蓝链却未移除内部链接助手模板的页面', false, [
        'page',
    ]);

    const pageContent = await bot.batchQuery(pages, 500, 3, 5000);

    const selector = `template:is(#${names.join(', #')})`,
        result: Record<string, string> = {};
    for (const [title, content] of Object.entries(pageContent)) {
        const root = Parser.parse(content),
            templates = root.querySelectorAll<TranscludeToken>(selector);

        if (templates.length === 0) {
            result[title] = '';
            continue;
        }

        for (const template of templates) {
            const target = template.getValue(1),
                display = template.getValue(3);
            template.replaceWith(`[[${target}${display ? `|${display}` : ''}]]`);
        }

        const newContent = root.toString();
        if (newContent !== content) {
            result[title] = newContent;
        }
    }

    for (const [title, text] of Object.entries(result)) {
        if (text === '') {
            await api.postWithToken('csrf', {
                action: 'edit',
                title,
                appendtext: '',
                summary: '机器人：零编辑',
                minor: true,
                bot: true,
            });
            console.log(`NULLEDIT: ${title}`);
        } else {
            await api.postWithToken('csrf', {
                action: 'edit',
                title,
                text,
                summary: '机器人：移除已弃用模板',
                minor: true,
                bot: true,
            });
            console.log(`REPLACED: ${title}`);
        }
        await delay();
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
