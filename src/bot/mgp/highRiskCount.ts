import pMap from 'p-map';
import Parser from 'wikiparser-node';
import { zhapi as api } from '@/api';
import { createRateLimiter } from '@/infra';
import { BotInstance } from '@/lib';
import { run } from '@/runner';

const bot = new BotInstance(api);

const format = (num: number): string => {
    if (num < 500) {
        return `${num}`;
    } else if (num < 1000) {
        return '500+';
    } else {
        return `${Math.floor(num / 1000) * 1000}+`;
    }
};

const getNewCount = async (templates: string[]): Promise<Map<string, string>> => {
    const result = new Map<string, string>();
    await pMap(
        templates,
        async title => {
            result.set(title, format((await bot.getEmbedded(title)).length));
        },
        { concurrency: 5 },
    );
    return result;
};

(async () => {
    await run({ api, site: 'zh' }, async () => {
        const riskDocs = (await bot.getEmbedded('Template:High-risk', [10]))
                .filter(item => item !== 'Template:High-risk' && item !== 'Template:High-risk/doc')
                .filter(item => item.includes('/doc')),
            risk = riskDocs.map(item => item.replace('/doc', ''));

        const newCount = await getNewCount(risk);
        const pageContent = await bot.batchQuery(riskDocs);
        console.log(`Checking ${riskDocs.length} high-risk template doc page(s)...`);
        const limiter = createRateLimiter();
        let updated = 0,
            skipped = 0;

        await limiter.map(Object.entries(pageContent), async ([title, { content, revid }]) => {
            const root = Parser.parse(content),
                highRiskTemplate = root.querySelector<Parser.TranscludeToken>(
                    'template[name="Template:High-risk"]',
                ),
                count = highRiskTemplate?.getValue(1),
                newNum = newCount.get(title.replace(/\/doc$/u, ''));
            if (count !== newNum && newNum) {
                highRiskTemplate?.setValue('1', `${newNum}`);
                await bot.edit({
                    title,
                    text: root.toString(),
                    baserevid: revid,
                    summary: '更新模板链入数据',
                    tags: 'Bot',
                });
                updated++;
                console.log(`${title}：「${count}」→「${newNum}」`);
            } else {
                skipped++;
                console.log(`Skipped: ${title}`);
            }
        });
        console.log(`Completed: ${updated} updated, ${skipped} skipped.`);
    });
})();
