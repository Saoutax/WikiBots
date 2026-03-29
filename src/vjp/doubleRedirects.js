import { vjpapi as api, Login } from "../utils/apiLogin.js";

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login("vjp.bot");

    const {
        data: {
            query: {
                querypage: { results },
            },
        },
    } = await api.post({
        action: "query",
        format: "json",
        list: "querypage",
        formatversion: "2",
        qppage: "DoubleRedirects",
        qplimit: "max",
    });

    for (const {
        title,
        databaseResult: { c_namespace, c_title },
    } of results) {
        const text = `#REDIRECT [[:${c_title}]]${Number(c_namespace) === 14 ? `\n{{分类重定向|${c_title}}}` : ""}`;
        await api.postWithToken("csrf", {
            action: "edit",
            title,
            text,
            tags: "Bot",
            bot: true,
            minor: true,
            summary: "修复双重重定向",
        });
        console.log(`Done: ${title} → ${c_title}`);
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
