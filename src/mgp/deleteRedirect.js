import dayjs from "dayjs";
import { zhapi, cmapi, Login } from "../utils/apiLogin.js";
import FlagDelete from "../utils/flagDelete.js";
import { CheckGlobalUsage, CheckRedirect } from "../utils/pageInfo.js";

const now = dayjs();
const day = now.day() === 1 ? 7 : 1;
const time = now.subtract(day, "day");

async function getRecentMoves() {
    try {
        const res = await cmapi.post({
            action: "query",
            list: "logevents",
            letype: "move",
            lenamespace: 6,
            lelimit: 500,
            lestart: time.toISOString(),
            ledir: "newer",
        });

        const files = res.data?.query?.logevents || [];
        return files.map(e => e.title);
    } catch (err) {
        console.error("获取移动日志出错:", err);
        return [];
    }
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(zhapi).login("zh.bot");
    const { lgusername } = await new Login(cmapi).login("cm.bot");

    const movedFiles = await getRecentMoves();

    if (!movedFiles.length) {
        console.log(`最近 ${day} 日无文件移动记录`);
        console.log(`End time: ${new Date().toISOString()}`);
        return;
    }

    const redirects = await new CheckRedirect(cmapi).check(movedFiles),
        isRedirect = Object.keys(redirects).filter(key => redirects[key] === true);

    const usage = await new CheckGlobalUsage(cmapi).check(isRedirect),
        unused = Object.keys(usage).filter(key => usage[key] === false),
        used = Object.keys(usage).filter(key => usage[key] === true);

    if (used.length > 0) {
        const today = dayjs().format("YYYY年MM月DD日");
        const text = used.map(item => `* [[cm:${item}|${item}]]`).join("\n");

        await zhapi.postWithToken(
            "csrf",
            {
                action: "edit",
                title: "User:SaoMikoto/Bot/log/deleteRedirect",
                appendtext: `\n\n== ${today} ==\n${text}`,
                summary: "记录仍有使用的重定向",
                minor: true,
                bot: true,
                tags: "Bot",
            },
            { retry: 10 },
        );

        console.log(`共 ${used.length} 个重定向仍存在使用：\n${used.join("\n")}`);
    }

    const success = await new FlagDelete(cmapi).flagDelete(
        unused,
        "移动残留重定向",
        lgusername,
        "自动挂删文件移动残留重定向",
    );

    if (success.length > 0) {
        console.log(`成功挂删 ${success.length} 个重定向：\n${success.join("\n")}`);
    } else {
        console.log("没有需要挂删的重定向");
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
