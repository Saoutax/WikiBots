import moment from "moment-timezone";
import { MediaWikiApi } from "wiki-saikou";
import config from "../utils/config.js";
import GetJSON from "../utils/getJSON.js";

moment.tz.setDefault("Asia/Shanghai");

const api = new MediaWikiApi({
    baseURL: config.vjp.api,
    fexiosConfigs: {
        headers: { "user-agent": config.useragent },
    }
});


(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    const { lgusername: username } = await api.login(
        config.vjp.bot.name,
        config.vjp.bot.password,
        undefined,
        { retry: 25, noCache: true },
    ).then(res => {
        console.log(res);
        return res;
    });

    const { data: { query: { statistics: { articles, edits, users, activeusers } } } } = await api.get({
        meta: "siteinfo",
	    siprop: "statistics"
    });

    // TODO：移入模板，通过{{Echart}}显示
    const title = `User:${username}/siteStatistics.json`;
    const statistics = await new GetJSON(api).get(title);

    statistics[moment().format("YYYY-MM-DD")] = { articles, edits, users, activeusers };

    const text = JSON.stringify(statistics, null, 4);

    await api.postWithToken("csrf", {
        action: "edit",
        title,
        text,
        summary: "更新统计数据",
        tags: "Bot",
        bot: true,
        minor: true,
        nocreate: true,
        watchlist: "nochange",
    });

    console.log(`End time: ${new Date().toISOString()}`);
})();
