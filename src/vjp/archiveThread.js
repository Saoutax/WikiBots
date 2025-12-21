import _ from "lodash";
import moment from "moment-timezone";
import { MediaWikiApi } from "wiki-saikou";
import Parser from "wikiparser-node";
import config from "../utils/config.js";
import parseThread from "../utils/parseThread.js";

moment.tz.setDefault("Asia/Shanghai");

const api = new MediaWikiApi({
    baseURL: config.vjp.api,
    fexiosConfigs: {
        headers: { "user-agent": config.useragent },
    },
});

async function getParsedThread() {
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
        titles: "Vocawiki:讨论版",
    });

    return parseThread(content);
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await api.login(config.vjp.bot.name, config.vjp.bot.password, undefined, { retry: 25, noCache: true }).then(console.log);

    const discussionThread = await getParsedThread();

    const currentTime = moment().format("YYYYMMDD");
    const currentYear = moment().format("YYYY年");

    let archive = "";
    const discussion = _.cloneDeep(discussionThread);
    Object.entries(discussionThread)
        .filter(([key]) => !isNaN(Number(key)))
        .sort(([a], [b]) => Number(a) - Number(b))
        .forEach(([key, value]) => {
            const parsedThread = Parser.parse(value.thread);
            const saved = parsedThread.querySelector("template#Template:Saved");
            if (saved && moment().day() === 1) {
                delete discussion[key];
                console.log(`周一移除已存档讨论串：${value.title}`);
            }
            const mar = parsedThread.querySelector("template#Template:MarkAsResolved");
            if (mar) {
                const archiveTime = moment(mar.getValue().time, "YYYYMMDD").add(Number(mar.getValue()["archive-offset"]), "days").format("YYYYMMDD");
                if (currentTime >= archiveTime) {
                    discussion[key].content = `== ${value.title} ==\n{{Saved|link=Vocawiki:讨论版/存档/${currentYear}#${value.title}}}\n\n`;
                    archive += discussionThread[key].content;
                    console.log(`存档讨论串：${value.title}`);
                }
            }
        });

    const newDiscussion =
        discussion.preface +
        Object.keys(discussion)
            .filter(k => k !== "preface")
            .sort((a, b) => Number(a) - Number(b))
            .map(k => discussion[k].content)
            .join("");

    const PAGE_MAP = {
        [`Vocawiki:讨论版/存档/${currentYear}`]: {
            content: archive ? `\n\n${archive}` : "",
            append: true,
        },
        "Vocawiki:讨论版": {
            content: newDiscussion,
            append: false,
        },
    };

    for (const [title, { content, append }] of Object.entries(PAGE_MAP)) {
        const params = {
            action: "edit",
            title,
            summary: "存档过期讨论串",
            minor: true,
            bot: true,
            tags: "Bot",
            watchlist: "nochange",
        };
        append ? (params.appendtext = content) : (params.text = content);
        await api.postWithToken("csrf", params, {
            retry: 50,
            noCache: true,
        });
    }
    console.log("存档成功。");

    console.log(`End time: ${new Date().toISOString()}`);
})();
