import { MediaWikiApi } from 'wiki-saikou';
import config from '../../utils/config.js';
import QueryCategory from '../../utils/queryCats.js';

const api = new MediaWikiApi(config.zh.api, {
	headers: { 'user-agent': config.useragent },
});

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await api.login(
		config.zh.bot.name,
		config.zh.bot.password,
		undefined,
		{ retry: 25, noCache: true },
	).then(console.log);

	const fetcher = new QueryCategory(api);

    const pages = await fetcher.queryCat('Category:刀剑神域', true);
    console.log(pages);
	

	console.log(`End time: ${new Date().toISOString()}`);
})();