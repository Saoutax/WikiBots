import { MediaWikiApi } from 'wiki-saikou';
import config from '../../utils/config.js';

const api = new MediaWikiApi(config.cm.api, {
	headers: { 'user-agent': config.useragent },
});

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await api.login(
		config.cm.bot.name,
		config.cm.bot.password,
		undefined,
		{ retry: 25, noCache: true },
	).then(console.log);

	console.log(`End time: ${new Date().toISOString()}`);
})();