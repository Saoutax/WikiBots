import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { vjpapi as api, Login } from "../utils/apiLogin.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.tz.setDefault("Asia/Shanghai");

const now = dayjs.utc(),
    start = now.toISOString(),
    end = now.subtract(30, "day").toISOString();

const timestampCST = ts => dayjs(ts).tz("Asia/Shanghai").format("YYYY-MM-DD HH:mm:ss [(CST)]");

async function getRecentChanges() {
    const users = new Map();
    let cont;
    do {
        const { data } = await api.post({
            list: "recentchanges",
            rcprop: "user|timestamp|comment",
            rcshow: "!bot",
            rctype: "edit|new",
            rclimit: "max",
            rcstart: start,
            rcend: end,
            rccontinue: cont,
        });
        const list = data?.query?.recentchanges;
        if (!list?.length) {
            break;
        }

        const regex = /文字替换/u;
        for (const revision of list) {
            const { comment = "", user, timestamp } = revision;
            if (regex.test(comment)) {
                continue;
            }
            const time = dayjs(timestamp);
            const userData = users.get(user) || { count: 0, latest: time };
            userData.count++;
            if (time.isAfter(userData.latest)) {
                userData.latest = time;
            }
            users.set(user, userData);
        }

        cont = data.continue?.rccontinue;
    } while (cont);
    return users;
}

(async () => {
    console.log(`Start: ${new Date().toISOString()}`);

    await new Login(api).login("vjp.bot");

    const users = await getRecentChanges();

    let text = "* 本页面是由[[U:MisakaNetwork|机器人]]生成的活跃用户近30日内编辑统计。\n";
    text += "* 不包含机器人用户组与通过[[Special:ReplaceText|替换文本]]进行的编辑。\n";
    text += "* 生成时间：{{subst:#time:Y年n月j日 (D) H:i (T)|||1}}\n\n";
    // prettier-ignore
    text += "{| class=\"wikitable sortable\" width=100%\n|-\n! 用户 !! 编辑数 !! 最后编辑时间\n";

    for (const [user, info] of users.entries()) {
        text += `|-\n| {{User Avatar|user=${user}|size=30px|style=border:2px solid white;border-radius:50%;box-shadow:0px 0px 1px gray;}} [[User:${user}|${user}]] || ${info.count} || ${timestampCST(info.latest)}\n`;
    }

    text += "|}\n[[Category:Vocawiki数据报告]]";

    await api.postWithToken("csrf", {
        action: "edit",
        title: "Vocawiki:活跃用户编辑报告",
        text,
        summary: "更新数据报告",
        tags: "Bot",
        bot: true,
        minor: true,
        nocreate: true,
        watchlist: "nochange",
    });

    console.log(`End: ${new Date().toISOString()}`);
})();
