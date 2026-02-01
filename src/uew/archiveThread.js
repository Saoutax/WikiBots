import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import _ from "lodash";
import { uewapi as api, Login } from "../utils/apiLogin.js";
import parseThread from "../utils/parseThread.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.tz.setDefault("Asia/Shanghai");

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
        titles: "地球联合百科讨论:会议大厅",
    });

    return parseThread(content);
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login("uew.bot");

    const discussionThread = await getParsedThread();

    const currentMonth = dayjs().tz().format("YYYY年MM月");

    let archive = "";
    const discussion = _.cloneDeep(discussionThread);
    Object.entries(discussionThread)
        .filter(([key]) => !isNaN(Number(key)))
        .sort(([a], [b]) => Number(a) - Number(b))
        .forEach(([key, value]) => {
            delete discussion[key];
            archive += discussionThread[key].content;
            console.log(`存档讨论串：${value.title}`);
        });

    const newDiscussion =
        discussion.preface +
        Object.keys(discussion)
            .filter(k => k !== "preface")
            .sort((a, b) => Number(a) - Number(b))
            .map(k => discussion[k].content)
            .join("");

    const PAGE_MAP = {
        [`地球联合百科讨论:会议大厅/存档/${currentMonth}`]: {
            content: archive ? `\n\n${archive}` : "",
            append: true,
        },
        "地球联合百科讨论:会议大厅": {
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
