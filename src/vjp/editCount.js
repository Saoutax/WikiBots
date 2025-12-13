import { MediaWikiApi } from "wiki-saikou";
import config from "../utils/config.js";

const api = new MediaWikiApi({
    baseURL: config.vjp.api,
    fexiosConfigs: {
        headers: { "user-agent": config.useragent },
    }
});

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await api.login(
        config.vjp.bot.name,
        config.vjp.bot.password,
        undefined,
        { retry: 25, noCache: true },
    ).then(console.log);

    const { data: { query: { allusers } } } = await api.postWithToken("csrf", {
        list: "allusers",
        auexcludegroup: "bot",
        auprop: "editcount",
        aulimit: "max",
        auwitheditsonly: 1
    });

    const count = Object.fromEntries(
        allusers.map(user => [user.name, user.editcount])
    );

    let text = "* 本页面是由[[U:MisakaNetwork|机器人]]生成的全站累计编辑统计。\n";
    text += "* 生成时间：{{subst:#time:Y年n月j日 (D) H:i (T)|||1}}\n\n";
    text += "{| class=\"wikitable sortable\" width=100%\n|-\n! 用户 !! 编辑数\n";
    for (const [user, editcount] of Object.entries(count)) {
        text += `|-\n| {{User Avatar|user=${user}|size=30px|style=border:2px solid white;border-radius:50%;box-shadow:0px 0px 1px gray;}} [[User:${user}|${user}]] || ${editcount}\n`;
    }
    text += "|}\n[[Category:Vocawiki数据报告]]";

    await api.postWithToken("csrf", {
        action: "edit",
        title: "Vocawiki:全站累计编辑报告",
        text,
        summary: "更新数据报告",
        tags: "Bot",
        bot: true,
        nocreate: true,
        watchlist: "nochange",
    });

    console.log(`End time: ${new Date().toISOString()}`);
})();
