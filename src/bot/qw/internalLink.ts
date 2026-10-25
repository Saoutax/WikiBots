import Parser from 'wikiparser-node';
import { run, qwapi as api } from '@/api';
import { BotInstance } from '@/lib';
import type { PageContent } from '@/lib';
import { delay } from '@/utils';

const bot = new BotInstance(api);

interface PageItem {
    title: string;
}

(async () => {
    await run({ api, site: 'qw' }, async () => {
        let eicontinue: string | undefined;
        do {
            const group: string[] = [];
            const {
                data,
                data: {
                    query: { embeddedin = [] },
                },
            } = await api.post({
                action: 'query',
                list: 'embeddedin',
                eititle: 'Template:Internal_link_helper/en',
                einamespace: '0',
                eilimit: '500',
                eicontinue,
            });

            eicontinue = data?.continue?.eicontinue;

            embeddedin.forEach((page: PageItem) => {
                group.push(page.title);
            });

            const pageContent = await bot.batchQuery(group, 500);

            const result: Record<string, PageContent> = {};
            for (const [title, { content, revid }] of Object.entries(pageContent)) {
                const root = Parser.parse(content),
                    templates = root.querySelectorAll<Parser.TranscludeToken>(
                        'template:is(#Template:Le, #Template:Internal_link_helper/en, #Template:Link-en, #Template:En-link, #Template:Ilh/en, #Template:LE)',
                    );

                for (const template of templates) {
                    const target = template.getValue(1),
                        display = template.getValue(3);
                    template.replaceWith(`[[${target}${display ? `|${display}` : ''}]]`);
                }

                const newContent = root.toString();
                if (newContent !== content) {
                    result[title] = { content: newContent, revid };
                }
            }

            for (const [title, { content: text, revid }] of Object.entries(result)) {
                await bot.edit({
                    title,
                    text,
                    baserevid: revid,
                    summary: '机器人：移除已弃用模板',
                });
                console.log(`Done: ${title}`);
                await delay();
            }

            console.log('Start next group.');
        } while (eicontinue);
    });
})();
