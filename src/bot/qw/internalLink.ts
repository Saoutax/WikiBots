import type { ApiQueryResponseWithResult } from 'types-mediawiki-response';
import Parser from 'wikiparser-node';
import { run, qwapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { createRateLimiter } from '@/utils';

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'qw' }, async () => {
        const limiter = createRateLimiter({ concurrency: 1, interval: 3000, intervalCap: 1 });
        let eicontinue: string | number | undefined;
        do {
            const { data } = await api.post<ApiQueryResponseWithResult>({
                action: 'query',
                list: 'embeddedin',
                eititle: 'Template:Internal_link_helper/en',
                einamespace: '0',
                eilimit: '500',
                eicontinue,
            });

            eicontinue = data?.continue?.eicontinue;

            const group = (data?.query?.embeddedin ?? []).map(page => page.title),
                pageContent = await bot.batchQuery(group, 500);

            const edits: { title: string; text: string; revid: number }[] = [];
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

                const text = root.toString();
                if (text !== content) {
                    edits.push({ title, text, revid });
                }
            }

            await limiter.map(edits, async ({ title, text, revid }) => {
                await bot.edit({
                    title,
                    text,
                    baserevid: revid,
                    summary: '机器人：移除已弃用模板',
                });
                console.log(`Done: ${title}`);
            });

            console.log('Start next group.');
        } while (eicontinue);
    });
})();
