import { zhapi as api } from '@/api';
import { createRateLimiter } from '@/infra';
import { BotInstance, type PageContent } from '@/lib';
import { run } from '@/runner';

const bot = new BotInstance(api);

interface EditTask {
    title: string;
    text: string;
    revid: number;
}

const collectFixes = (obj: Record<string, PageContent>): EditTask[] => {
    const tasks: EditTask[] = [];
    for (const [title, { content, revid }] of Object.entries(obj)) {
        const text = content
            .replace(/(<\/noinclude>)\s*\n\s*({{[\s]*navbox)/gi, '$1$2')
            .replace(/(<\/noinclude>)\s*\n\s*({{#invoke:Nav\|box)/gi, '$1$2')
            .replace(/(\]\])•/gu, '$1 •')
            .replace(/•(\[\[)/gu, '• $1');

        if (text !== content) {
            tasks.push({ title, text, revid });
        }
    }
    return tasks;
};

(async () => {
    await run({ api, site: 'zh' }, async () => {
        const navTemplates = await bot.getEmbedded('Template:Navbox', [10]),
            navModules = await bot.getLinked('Module:Nav', [10]),
            allTemplates = [...new Set([...navTemplates, ...(Object.values(navModules)[0] ?? [])])];
        console.log(`共计 ${allTemplates.length} 个链入`);

        const tasks = collectFixes(await bot.batchQuery(allTemplates));
        console.log(`共计 ${tasks.length} 个模板需要修正`);

        const limiter = createRateLimiter();
        await limiter.map(tasks, async ({ title, text, revid }) => {
            await bot.edit({
                title,
                text,
                baserevid: revid,
                summary: '自动修复格式排版',
                tags: 'Bot',
            });
            console.log(`√ ${title}`);
        });
        console.log(
            tasks.length > 0
                ? `Completed: fixed ${tasks.length} template(s).`
                : 'No templates need formatting fixes.',
        );
    });
})();
