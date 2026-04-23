import Parser, { type TranscludeToken } from 'wikiparser-node';
import { zhapi as api, Login } from '@/api';
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
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'zh', account: 'bot' });

    const riskDocs = (await bot.getEmbedded('Template:High-risk', [10]))
            .filter(item => item !== 'Template:High-risk' && item !== 'Template:High-risk/doc')
            .filter(item => item.includes('/doc')),
        risk = riskDocs.map(item => item.replace('/doc', ''));

    const newCount = await getNewCount(risk);

    const pageContent = await bot.batchQuery(riskDocs);
    await Promise.all(
        Object.entries(pageContent).map(async ([title, content]) => {
            const root = Parser.parse(content),
                highRiskTemplate = root.querySelector<TranscludeToken>(
                    'template[name="Template:High-risk"]',
                ),
                count = highRiskTemplate?.getValue(1),
                newNum = newCount[title];
            if (count !== newNum && newNum) {
                highRiskTemplate?.setValue('1', `${newNum}`);
                await api.postWithToken(
                    'csrf',
                    {
                        action: 'edit',
                        title,
                        text: root.toString(),
                        summary: '更新模板链入数据',
                        bot: true,
                        minor: true,
                        tags: 'Bot',
                        format: 'json',
                    },
                    { retry: 10 },
                );
                console.log(`${title}：「${count}」→「${newNum}」`);
            } else {
                console.log(`Skipped: ${title}`);
            }
        }),
    );

    console.log(`End time: ${new Date().toISOString()}`);
})();
