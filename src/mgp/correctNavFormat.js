import { zhapi as api, Login } from "../utils/apiLogin.js";
import { BatchQuery } from "../utils/batchQuery.js";
import { GetEmbeddedPages } from "../utils/pageInfo.js";

function fixFormat(obj) {
    const result = {};

    for (const [pageName, content] of Object.entries(obj)) {
        const fixedContent = content
            .replace(/(<\/noinclude>)\s*\n\s*({{[\s]*navbox)/gi, "$1$2")
            .replace(/(<\/noinclude>)\s*\n\s*({{#invoke:Nav\|box)/gi, "$1$2")
            .replace(/(\]\])•/gu, "$1 •")
            .replace(/•(\[\[)/gu, "• $1");

        if (fixedContent !== content) {
            result[pageName] = fixedContent;
        }
    }

    return result;
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login("zh.bot");

    const navTemplates = await new GetEmbeddedPages(api).get("Template:Navbox", 10);
    const navModules = await new GetEmbeddedPages(api).get("Module:Nav", 10);
    const allTemplates = [...new Set([...navTemplates, ...navModules])];
    console.log(`共计 ${allTemplates.length} 个链入`);

    const pagesObj = await new BatchQuery(api).query(allTemplates);

    const fixed = fixFormat(pagesObj);

    console.log(`共计 ${Object.keys(fixed).length} 个模板需要修正`);

    for (const [title, text] of Object.entries(fixed)) {
        await api.postWithToken("csrf", {
            action: "edit",
            title,
            text,
            summary: "自动修复格式排版",
            minor: true,
            tags: "Bot",
            bot: true,
        });
        console.log(`√ ${title}`);
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();