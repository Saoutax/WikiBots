import { MediaWikiApi } from "wiki-saikou";
import config from "../utils/config.js";

const api = new MediaWikiApi({
    baseURL: config.vjp.api,
    fexiosConfigs: {
        headers: { "user-agent": config.useragent },
    },
});

const PAGE_MAP = {
    "Help:沙盒": {
        content: "<noinclude><!-- 请勿删除此行 -->{{沙盒页顶}}<!-- Please do not delete this line --></noinclude>\n== 请在这行文字底下开始测试 ==",
        summary: "沙盒清理作业，若想保留较长时间，可在[[Special:MyPage/Sandbox|个人沙盒]]进行测试，或查阅页面历史并再次编辑本页。",
    },
    "Template:沙盒": {
        content: "<noinclude><!-- 请勿删除此行 -->{{沙盒页顶}}<!-- Please do not delete this line --></noinclude>",
        summary: "沙盒清理作业，若想保留较长时间，可在[[Special:MyPage/Sandbox|个人沙盒]]进行测试，或查阅页面历史并再次编辑本页。",
    },
    "Help:沙盒/styles.css": {
        content: "/* [[Category:沙盒]] */",
        summary: "沙盒清理作业，若想保留较长时间，可在[[Special:MyPage/Sandbox|个人沙盒]]进行测试，或查阅页面历史并再次编辑本页。",
    },
    "Template:沙盒/styles.css": {
        content: "/* [[Category:在模板命名空间下的CSS页面]][[Category:沙盒]] */",
        summary: "沙盒清理作业，若想保留较长时间，可在[[Special:MyPage/Sandbox|个人沙盒]]进行测试，或查阅页面历史并再次编辑本页。",
    },
    "Module:沙盒": {
        content: "",
        summary: "沙盒清理作业，若想保留较长时间，可建立「Module:沙盒/用户名/沙盒名」进行测试，或查阅页面历史并再次编辑本页。",
    },
};

async function pageEdit(title) {
    await api
        .postWithToken(
            "csrf",
            {
                action: "edit",
                title,
                text: PAGE_MAP[title].content,
                minor: true,
                bot: true,
                tags: "Bot",
                summary: PAGE_MAP[title].summary,
                watchlist: "nochange",
            },
            {
                retry: 50,
                noCache: true,
            },
        )
        .then(({ data }) => console.log(JSON.stringify(data)));
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await api.login(config.vjp.bot.name, config.vjp.bot.password, undefined, { retry: 25, noCache: true }).then(console.log);

    const {
        data: {
            query: { pages },
        },
    } = await api.post(
        {
            prop: "revisions|info",
            titles: Object.keys(PAGE_MAP),
            rvprop: "timestamp|content",
            inprop: "touched",
        },
        {
            retry: 15,
        },
    );

    await Promise.all(
        pages.map(async ({ title, revisions: [{ timestamp }], touched }) => {
            const minutes = (Date.now() - new Date(touched || timestamp).getTime()) / 60000;
            if (minutes > 180) {
                await pageEdit(title);
            } else {
                console.log(`${title} 在 ${minutes.toFixed(1)} 分钟前存在编辑，跳过。`);
            }
        }),
    );

    console.log(`End time: ${new Date().toISOString()}`);
})();
