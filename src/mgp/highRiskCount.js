import { MediaWikiApi } from 'wiki-saikou';
import Parser from 'wikiparser-node';
import config from '../utils/config.js';
import { GetEmbeddedPages } from '../utils/pageInfo.js';

const api = new MediaWikiApi(config.zh.api, {
	headers: { 'user-agent': config.useragent },
});

async function getParsedPage(titles) {
	const { data: { query: { pages: [{ revisions: [{ content }] }] } } } = await api.post({
		action: 'query',
		prop: 'revisions',
		titles,
		rvprop: 'content',
		format: 'json',
	  }, { retry: 15 });
	return Parser.parse(content);
}

async function getOldCount(pages) {
	const results = await Promise.all(pages.map(async (page) => {
		const key = page.split('/')[0];
		try {
			const parsedPage = await getParsedPage(page);
			const tpl = parsedPage.querySelector('template#Template:High-risk');
			const anonArg = tpl?.getAnonArgs()?.[0]?.value ?? null;
			return [key, anonArg];
		} catch {
			return [key, null];
		}
	}));
	return Object.fromEntries(results);
}

function formatNum(num) {
    if (num < 500) {
		return `${num}`;
	} else if (num < 1000) {
		return "500+";
	} else {
		return `${Math.floor(num / 1000) * 1000}+`;
	}
}

(async () => {
	await api.login(
		config.zh.bot.name,
		config.zh.bot.password,
		undefined,
		{ retry: 25, noCache: true },
	);

	const gep = new GetEmbeddedPages(api);
	const risk = await gep.get("Template:High-risk", "10");
	const riskDocs = risk.filter(item => item.includes('/doc'));
	const riskTemplates = riskDocs.map(item => item.replace('/doc', ''));

	const oldResults = await getOldCount(riskDocs);

	for (const tpl of riskTemplates) {
		try {
			const pages = await gep.get(tpl);
			const newCount = formatNum(pages.length);
			const oldCount = oldResults[tpl];

			if (newCount === oldCount) {
				continue;
			}

			const pageTitle = `${tpl}/doc`;
			const parsedPage = await getParsedPage(pageTitle);
			const highrisk = parsedPage.querySelector('template#Template:High-risk');
			
			const anonArgs = highrisk.getAnonArgs();
			if (anonArgs.length > 0) {
				anonArgs[0].setValue(`${newCount}`);
			} else {
				highrisk.append(`|${newCount}`);
			}
			
			await api.postWithToken('csrf', {
				action: 'edit',
				title: pageTitle,
				text: parsedPage.toString(),
				summary: `更新模板链入数据`,
				bot: true,
				minor: true,
				tags: 'Bot',
				format: 'json',
			}, { retry: 10 });

			console.log(`${tpl}：「${oldCount}」→「${newCount}」`);
				
		} catch (e) {
			console.error(`处理模板 ${tpl} 时出错:`, e);
		}
	}
})();
