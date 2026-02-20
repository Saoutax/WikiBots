import { zhapi, cmapi, Login } from "../utils/apiLogin.js";
import FlagDelete from "../utils/flagDelete.js";
import GetJSON from "../utils/getJSON.js";
import { CheckGlobalUsage } from "../utils/pageInfo.js";
import QueryCategory from "../utils/queryCats.js";

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(zhapi).login("zh.bot");
    const { lgusername } = await new Login(cmapi).login("cm.bot");

    const { categories } = await new GetJSON(zhapi).get(
        "User:SaoMikoto/Bot/config/deleteUnused.json",
    );

    const files = await new QueryCategory(cmapi).queryCat(categories, true, "file");

    const usage = await new CheckGlobalUsage(cmapi).check(files);
    const unused = Object.keys(usage).filter(key => usage[key] === false);

    const success = await new FlagDelete(cmapi).flagDelete(
        unused,
        "无使用或不再使用的文件",
        lgusername,
    );
    console.log(success);

    console.log(`End time: ${new Date().toISOString()}`);
})();
