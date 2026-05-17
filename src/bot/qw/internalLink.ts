import type { MwApiResponse } from 'wiki-saikou';
import Parser, { type TranscludeToken } from 'wikiparser-node';
import { qwapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';
import { delay } from '@/utils';

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'qw', account: 'bot' });

    const bot = new BotInstance(api);

    let eicontinue;
    do {
        const group: string[] = [];
        const {
            data,
            data: {
                query: { embeddedin = [] },
            },
        } = (await api.post({
            action: 'query',
            list: 'embeddedin',
            eititle: 'Template:Internal_link_helper/en',
            einamespace: '0',
            eilimit: '500',
            eicontinue,
        })) as MwApiResponse;

        eicontinue = data?.continue?.eicontinue;

        embeddedin.forEach((page: { title: string }) => {
            group.push(page.title);
        });

        const pageContent = await bot.batchQuery(group, 500);

        const result: Record<string, string> = {};
        for (const [title, content] of Object.entries(pageContent)) {
            const root = Parser.parse(content),
                templates = root.querySelectorAll<TranscludeToken>(
                    `template[name="Template:Le"], template[name="Template:Internal_link_helper/en"], template[name="Template:Link-en"], template[name="Template:En-link"], template[name="Template:Ilh/en"], template[name="Template:LE"]`,
                );

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
            await api.postWithToken('csrf', {
                action: 'edit',
                title,
                text,
                summary: '机器人：移除已弃用模板',
                minor: true,
                bot: true,
            });
            console.log(`Done: ${title}`);
            await delay();
        }

        console.log('Start next group.');
    } while (eicontinue);

    console.log(`End time: ${new Date().toISOString()}`);
})();
