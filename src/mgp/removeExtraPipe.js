import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import Parser from "wikiparser-node";
import { zhapi as api, Login } from "../utils/apiLogin.js";
import BatchQuery from "../utils/batchQuery.js";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("Asia/Shanghai");

const now = dayjs.utc();
const start = now.toISOString();
const end = now.subtract(1, "day").toISOString();

async function getPages() {
    const titles = new Set();
    let cont;
    do {
        const { data } = await api.post({
            format: "json",
            list: "recentchanges",
            formatversion: "2",
            rcstart: start,
            rcend: end,
            rcnamespace: "0|10", // (main), Template
            rclimit: "max",
            rccontinue: cont,
        });
        const list = data?.query?.recentchanges;
        if (!list?.length) {
            break;
        }
        for (const pages of list) {
            titles.add(pages.title);
        }
        cont = data.continue?.rccontinue;
    } while (cont);
    return [...titles];
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login("zh.bot");

    const pages = await getPages();
    const pageContent = await new BatchQuery(api).query(pages);

    const modify = {};
    for (const [title, content] of Object.entries(pageContent)) {
        const parsed = Parser.parse(content),
            links = parsed.querySelectorAll("link");
        for (const link of links) {
            // 暂时忽略带有锚点#的情况
            if (link.fragment || link.name !== link.innerText) {
                continue;
            }
            link.innerText = undefined;
        }

        const newContent = parsed.toString();
        if (newContent !== content) {
            modify[title] = newContent;
        }
    }

    for (const [title, text] of Object.entries(modify)) {
        await api.postWithToken("csrf", {
            action: "edit",
            title,
            text,
            summary: "移除多余管道符",
            bot: true,
            minor: true,
            tags: "Bot",
        });
        console.log(`√ ${title}`);
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
