import { zhapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';

const fixFormat = (obj: Record<string, string>) => {
    const result: Record<string, string> = {};
    for (const [pageName, content] of Object.entries(obj)) {
        const fixedContent = content
            .replace(/(<\/noinclude>)\s*\n\s*({{[\s]*navbox)/gi, '$1$2')
            .replace(/(<\/noinclude>)\s*\n\s*({{#invoke:Nav\|box)/gi, '$1$2')
            .replace(/(\]\])•/gu, '$1 •')
            .replace(/•(\[\[)/gu, '• $1');

        if (fixedContent !== content) {
            result[pageName] = fixedContent;
        }
    }
    return result;
};

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'zh', account: 'bot' });

    const bot = new BotInstance(api);

    const navTemplates = await bot.getEmbedded('Template:Navbox', [10]),
        navModules = await bot.getLinked('Module:Nav', [10]),
        allTemplates = [...new Set([...navTemplates, ...(Object.values(navModules)[0] ?? [])])];
    console.log(`共计 ${allTemplates.length} 个链入`);

    const fixed = fixFormat(await bot.batchQuery(allTemplates));
    console.log(`共计 ${Object.keys(fixed).length} 个模板需要修正`);

    for (const [title, text] of Object.entries(fixed)) {
        await api.postWithToken('csrf', {
            action: 'edit',
            title,
            text,
            summary: '自动修复格式排版',
            minor: true,
            tags: 'Bot',
            bot: true,
        });
        console.log(`√ ${title}`);
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
