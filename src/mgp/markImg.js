import { MediaWikiApi } from 'wiki-saikou';
import config from '../utils/config.js';
import moment from 'moment';

const zhapi = new MediaWikiApi(config.zh.api, {
	headers: { 'user-agent': config.useragent },
});
const cmapi = new MediaWikiApi(config.cm.api, {
	headers: { 'user-agent': config.useragent },
});

const now = moment.utc();
const start = now.toISOString();
const end = now.clone().subtract(26, 'hours').toISOString();

async function getPages(api) {
	const pages = new Set();
	let cont;

	do {
		const { data } = await api.post({
			list: 'recentchanges',
			rcprop: 'title|timestamp',
			rctype: 'edit|new',
			rctag: '疑似外链调用内部文件',
			rcstart: start,
			rcend: end,
			rclimit: 'max',
			rccontinue: cont,
		});

		const list = data?.query?.recentchanges;
		if (!list?.length) break;

		for (const rc of list) {
			pages.add(rc.title);
		}

		cont = data?.continue?.rccontinue;
	} while (cont);

	return Array.from(pages);
}

async function matchFiles(titles) {
	const matches = {};

	for (const title of titles) {
		const { data } = await zhapi.post({
			action: 'query',
			prop: 'revisions',
			titles: title,
			rvprop: 'content',
			formatversion: 2,
		});

		const page = data?.query?.pages?.[0];
		if (!page || !page.revisions?.[0]?.content) continue;

		const content = page.revisions[0].content;

		const regex = /\{\{filepath\:(.*?)\}\}/g;
		let match;
		while ((match = regex.exec(content)) !== null) {
			const fileName = `File:${match[1]}`;
			matches[fileName] = title;
		}
	}

	return matches;
}

async function notInCat(fileList, category) {
	const results = await Promise.all(fileList.map(async file => {
		const { data } = await cmapi.post({
			action: 'query',
			prop: 'categories',
			titles: file,
			cllimit: 'max',
			formatversion: 2,
		});
		const page = data?.query?.pages?.[0];
		if (!page || page.missing) {
			return null;
		}
		const inCategory = page.categories?.some(c => c.title === `Category:${category}`);
		return inCategory ? null : file;
	}));

	return results.filter(Boolean);
}

async function addTemplate(file, pageName) {
	const { data } = await cmapi.post({
		action: 'query',
		prop: 'revisions',
		titles: file,
		rvprop: 'content',
		formatversion: 2
	});

	const page = data?.query?.pages?.[0];
	if (!page || page.missing) return;

	const content = page.revisions[0].content + `\n{{非链入使用|[[zhmoe:${pageName}]]}}`;

	await cmapi.postWithToken('csrf', {
		action: 'edit',
		title: file,
		text: content,
		summary: '标记存在非链入使用的文件',
		minor: true,
		bot: true,
		tags: 'Bot'
	}, { retry: 10 });

	console.log(`${file}已标记。`);
}

(async () => {
	await Promise.all([
		zhapi.login(config.zh.bot.name, config.zh.bot.password, undefined, { retry: 25, noCache: true }),
		cmapi.login(config.cm.bot.name, config.cm.bot.password, undefined, { retry: 25, noCache: true }),
	]).then(res => console.log('Successful login at both sites.'));

	const pages = await getPages(zhapi);
	const fileList = await matchFiles(pages);
	const titles = Object.keys(fileList);
	const needMark = await notInCat(titles, '非链入使用的文件');

	for (const file of needMark) {
		await addTemplate(file, fileList[file]);
	}

})();
