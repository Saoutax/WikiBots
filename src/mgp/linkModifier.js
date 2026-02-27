import Parser from "wikiparser-node";
import { zhapi as api, Login } from "../utils/apiLogin.js";
import BatchQuery from "../utils/batchQuery.js";
import GetJSON from "../utils/getJSON.js";
import { GetLinkedPages } from "../utils/pageInfo.js";
import QueryCategory from "../utils/queryCats.js";

const escape = str => str.replace(/[()]/g, "\\$&");

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login("zh.bot");

    const { from, to, excludepages, excludecategory, extendsummary } = await new GetJSON(api).get(
        "User:SaoMikoto/Bot/config/linkModifier.json",
    );

    console.log(`from: ${from}, to: ${to}`);

    const exclude = [
        ...new Set([
            ...(await new QueryCategory(api).queryCat(excludecategory, false, "page")),
            ...excludepages,
        ]),
    ];

    const [linkPages] = Object.values(await new GetLinkedPages(api).get(from, "0|10")),
        modify = linkPages.filter(item => !exclude.includes(item)),
        pageContent = await new BatchQuery(api).query(modify);

    const result = {};
    for (const [page, content] of Object.entries(pageContent)) {
        const parsed = Parser.parse(content),
            links = parsed.querySelectorAll(`link#${escape(from)}`);
        for (const link of links) {
            const show = link.innerText === from;
            link.setTarget(to);
            if (show) {
                link.innerText = from;
            }
        }
        const newContent = parsed.toString();
        if (newContent !== content) {
            result[page] = newContent;
        }
    }

    console.log(`Total: ${Object.values(result).length}`);

    const summary = `替换链接：[[${from}]] → [[${to}]]${extendsummary ? `：${extendsummary}` : ""}`;
    for (const [title, text] of Object.entries(result)) {
        await api.postWithToken("csrf", {
            action: "edit",
            title,
            text,
            tags: "Bot",
            summary,
            bot: true,
            minor: true,
        });
        console.log(`Done: ${title}`);
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
