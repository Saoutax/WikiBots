import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { vjpapi as api, Login } from "../utils/apiLogin.js";
import GetJSON from "../utils/getJSON.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Shanghai");

async function getLastDayEditCount() {
    let cont;
    let count = 0;

    const end = dayjs().tz().toISOString(),
        start = dayjs().tz().subtract(1, "day").toISOString();

    do {
        const {
            data,
            data: {
                query: { recentchanges: list },
            },
        } = await api.get({
            list: "recentchanges",
            rcprop: "timestamp",
            rctype: "edit|new",
            rclimit: "max",
            rcstart: end,
            rcend: start,
            rccontinue: cont,
        });

        if (!list?.length) {
            break;
        }

        count += list.length;
        cont = data.continue?.rccontinue;
    } while (cont);

    return count;
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login("vjp.bot");

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

    const editCount = await getLastDayEditCount(),
        title = "Template:站点数据.json",
        statistics = await new GetJSON(api).get(title);

    statistics.dataset.source.push([
        dayjs().tz().format("YYYY-MM-DD"),
        users,
        activeusers,
        editCount,
        articles,
        edits,
    ]);

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
