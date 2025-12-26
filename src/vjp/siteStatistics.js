import moment from "moment-timezone";
import { vjpapi as api, Login } from "../utils/apiLogin.js";
import GetJSON from "../utils/getJSON.js";

moment.tz.setDefault("Asia/Shanghai");

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    const { lgusername: username } = await new Login(api).login("vjp.bot");

    const {
        data: {
            query: {
                statistics: { articles, edits, users, activeusers },
            },
        },
    } = await api.get({
        meta: "siteinfo",
        siprop: "statistics",
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
