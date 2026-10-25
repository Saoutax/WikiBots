import { run, zhapi as api } from '@/api';
import { BotInstance } from '@/lib';
import type { PageContent } from '@/lib';

const bot = new BotInstance(api);

const fixFormat = (obj: Record<string, PageContent>) => {
    const result: Record<string, PageContent> = {};
    for (const [pageName, { content, revid }] of Object.entries(obj)) {
        const fixedContent = content
            .replace(/(<\/noinclude>)\s*\n\s*({{[\s]*navbox)/gi, '$1$2')
            .replace(/(<\/noinclude>)\s*\n\s*({{#invoke:Nav\|box)/gi, '$1$2')
            .replace(/(\]\])•/gu, '$1 •')
            .replace(/•(\[\[)/gu, '• $1');

        if (fixedContent !== content) {
            result[pageName] = { content: fixedContent, revid };
        }
    }
    return result;
};

(async () => {
    await run({ api, site: 'zh' }, async () => {
        const navTemplates = await bot.getEmbedded('Template:Navbox', [10]),
            navModules = await bot.getLinked('Module:Nav', [10]),
            allTemplates = [...new Set([...navTemplates, ...(Object.values(navModules)[0] ?? [])])];
        console.log(`共计 ${allTemplates.length} 个链入`);

        const fixed = fixFormat(await bot.batchQuery(allTemplates));
        console.log(`共计 ${Object.keys(fixed).length} 个模板需要修正`);

        for (const [title, { content: text, revid }] of Object.entries(fixed)) {
            await bot.edit({
                title,
                text,
                baserevid: revid,
                summary: '自动修复格式排版',
                tags: 'Bot',
            });
            console.log(`√ ${title}`);
        }
    });
})();
