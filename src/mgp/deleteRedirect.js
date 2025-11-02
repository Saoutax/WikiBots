import { MediaWikiApi } from 'wiki-saikou';
import config from '../utils/config.js';
import { CheckGlobalUsage, CheckRedirect } from '../utils/pageInfo.js';
import FlagDelete from '../utils/flagDelete.js';

const api = new MediaWikiApi(config.cm.api, {
    headers: { 'user-agent': config.useragent },
});

const now = new Date();
const day = now.getDay() === 1 ? 7 : 1;
const time = new Date(now - 86400000 * day);

async function getRecentMoves() {
    try {
        const res = await api.post({
            action: 'query',
            list: 'logevents',
            letype: 'move',
            lenamespace: 6,
            lelimit: 500,
            lestart: time.toISOString(),
            ledir: 'newer'
        });

        const files = res.data?.query?.logevents || [];
        return files.map(e => e.title);
    } catch (err) {
        console.error('获取移动日志出错:', err);
        return [];
    }
}


(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await api.login(
		config.cm.bot.name,
		config.cm.bot.password,
		undefined,
		{ retry: 25, noCache: true },
	).then(console.log);
    const username = config.cm.bot.name.split('@')[0];

    const movedFiles = await getRecentMoves();

    if (!movedFiles.length) {
        console.log(`最近 ${day} 日无文件移动记录`);
        console.log(`End time: ${new Date().toISOString()}`);
        return;
    }

    const redirects = await new CheckRedirect(api).check(movedFiles);
    const isRedirect = Object.keys(redirects).filter(key => redirects[key] === true);
    
    const usage = await new CheckGlobalUsage(api).check(isRedirect);
    const unused = Object.keys(usage).filter(key => usage[key] === false);

    const successList = await new FlagDelete(api).flagDelete(unused, '移动残留重定向', '自动挂删文件移动残留重定向', username);

    if (successList.length > 0) {
        console.log(`成功挂删 ${successList.length} 个重定向`);
    } else {
        console.log('没有需要挂删的重定向');
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
