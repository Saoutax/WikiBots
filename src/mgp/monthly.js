import Parser from "wikiparser-node";
import { zhapi as api, Login } from "../utils/apiLogin.js";
import GetJSON from "../utils/getJSON.js";

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login("zh.bot");

    const { sectiontitle, summary } = await new GetJSON(api).get("User:SaoMikoto/Bot/config/monthly.json");

    const {
        data: {
            query: {
                pages: [
                    {
                        revisions: [{ content }],
                    },
                ],
            },
        },
    } = await api.get({
        action: "query",
        prop: "revisions",
        rvprop: "content",
        titles: "萌娘百科:萌娘百科月报/订阅",
    });

    const parsed = Parser.parse(content);
    const links = parsed.querySelectorAll("list + link");

    const pages = [...new Set(
        links
            .map(item => item.name)
            .filter(name => name.startsWith("User_talk:"))
    )];

    const text = "{{subst:User:SaoMikoto/Bot/config/monthly}}<span style=\"display:none\">~~~~</span>";

    for (const title of pages) {
        await api.postWithToken("csrf", {
            action: "edit",
            title,
            section: "new",
            sectiontitle,
            text,
            tags: "Bot",
            summary,
            watchlist: "nochange",
            bot: true,
        });
        console.log(`Done: ${title}`);
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();