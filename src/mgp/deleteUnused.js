import { MediaWikiApi } from "wiki-saikou";
import config from "../utils/config.js";
import FlagDelete from "../utils/flagDelete.js";
import GetJSON from "../utils/getJSON.js";
import { CheckGlobalUsage } from "../utils/pageInfo.js";
import QueryCategory from "../utils/queryCats.js";

const zhapi = new MediaWikiApi({
    baseURL: config.zh.api,
    fexiosConfigs: {
        headers: { "user-agent": config.useragent },
    }
});
const cmapi = new MediaWikiApi({
    baseURL: config.cm.api,
    fexiosConfigs: {
        headers: { "user-agent": config.useragent },
    }
});

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await zhapi.login(
        config.zh.bot.name,
        config.zh.bot.password,
        undefined,
        { retry: 25, noCache: true },
    ).then(console.log);
    const { lgusername: username } = await cmapi.login(
        config.cm.bot.name,
        config.cm.bot.password,
        undefined,
        { retry: 25, noCache: true },
    ).then(res => {
        console.log(res);
        return res;
    });

    const { categories } = await new GetJSON(zhapi).get("User:SaoMikoto/Bot/config/deleteUnused.json");

    const files = await new QueryCategory(cmapi).queryCat(categories, true, "file");

    const usage = await new CheckGlobalUsage(cmapi).check(files);
    const unused =  Object.keys(usage).filter(key => usage[key] === false);

    const success = await new FlagDelete(cmapi).flagDelete(unused, "无使用或不再使用的文件", username);
    console.log(success);

    console.log(`End time: ${new Date().toISOString()}`);
})();
