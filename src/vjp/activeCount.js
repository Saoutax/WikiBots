import { MediaWikiApi } from "wiki-saikou";
import config from "../utils/config.js";
import moment from "moment";

const api = new MediaWikiApi({
    baseURL: config.vjp.api,
    fexiosConfigs: {
        headers: { "user-agent": config.useragent },
    }
});

const now = moment.utc();
const start = now.toISOString();
const end = now.clone().subtract(30, "days").toISOString();

const timestampCST = ts => moment(ts).utcOffset(8).format("YYYY-MM-DD HH:mm:ss [(CST)]");

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
            const time = moment(timestamp);
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

    await api.login(
        config.vjp.bot.name,
        config.vjp.bot.password,
        undefined,
        { retry: 25, noCache: true },
    ).then(console.log);

    const users = await getRecentChanges();

    let text = "* 本页面是由[[U:MisakaNetwork|机器人]]生成的活跃用户近30日内编辑统计。\n";
    text += "* 不包含机器人用户组与通过[[Special:ReplaceText|替换文本]]进行的编辑。\n";
    text += "* 生成时间：{{subst:#time:Y年n月j日 (D) H:i (T)|||1}}\n\n";
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
        nocreate: true,
        watchlist: "nochange",
    });

    console.log(`End: ${new Date().toISOString()}`);
})();
