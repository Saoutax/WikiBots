import Parser from 'wikiparser-node';
import { run, zhapi as api } from '@/api';
import { BotInstance } from '@/lib';

const bot = new BotInstance(api);

const format = (num: number) => {
    if (num < 500) {
        return `${num}`;
    } else if (num < 1000) {
        return '500+';
    } else {
        return `${Math.floor(num / 1000) * 1000}+`;
    }
};

const getNewCount = async (templates: string[]) => {
    const result: Record<string, string> = {};
    await Promise.all(
        templates.map(async title => {
            result[title] = format((await bot.getEmbedded(title)).length);
        }),
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
        await Promise.all(
            Object.entries(pageContent).map(async ([title, { content, revid }]) => {
                const root = Parser.parse(content),
                    highRiskTemplate = root.querySelector<Parser.TranscludeToken>(
                        'template[name="Template:High-risk"]',
                    ),
                    count = highRiskTemplate?.getValue(1),
                    newNum = newCount[title];
                if (count !== newNum && newNum) {
                    highRiskTemplate?.setValue('1', `${newNum}`);
                    await bot.edit({
                        title,
                        text: root.toString(),
                        baserevid: revid,
                        summary: '更新模板链入数据',
                        tags: 'Bot',
                    });
                    console.log(`${title}：「${count}」→「${newNum}」`);
                } else {
                    console.log(`Skipped: ${title}`);
                }
            }),
        );
    });
})();
