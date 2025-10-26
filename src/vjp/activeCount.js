import { MediaWikiApi } from 'wiki-saikou';
import config from '../utils/config.js';
import moment from 'moment';

const api = new MediaWikiApi(config.vjp.api, {
	headers: { 'user-agent': config.useragent },
});

const now = moment.utc();
const start = now.toISOString();
const end = now.clone().subtract(30, 'days').toISOString();

const timestampCST = ts => `${moment(ts).utcOffset(8).format('YYYY-MM-DD HH:mm:ss')} (CST)`;

async function getActiveUsers() {
	const { data } = await api.post({
		list: 'allusers',
		auactiveusers: true,
		auprop: 'groups',
		aulimit: 'max',
	});
	return (data?.query?.allusers || [])
		.filter(u => !u.groups?.includes('bot'))
		.map(u => u.name);
}

async function getContribs(user) {
	const edits = [];
	let cont;
	do {
		const { data } = await api.post({
			list: 'usercontribs',
			ucuser: user,
			uclimit: 'max',
			ucprop: 'timestamp|comment',
			ucstart: start,
			ucend: end,
			uccontinue: cont,
		});
		const list = data?.query?.usercontribs;
		if (!list?.length) break;
		edits.push(...list.filter(e => !/文字替换/.test(e.comment || '')));
		cont = data.continue?.uccontinue;
	} while (cont);
	return edits;
}

(async () => {
	console.log(`Start: ${new Date().toISOString()}`);

	await api.login(
		config.vjp.bot.name,
		config.vjp.bot.password,
		undefined,
		{ retry: 25, noCache: true },
	).then(console.log);

	const users = await getActiveUsers();

	let text = '* 本页面是由[[U:MisakaNetwork|机器人]]生成活跃用户近30日内的编辑统计。\n';
	text += '* 不包含机器人用户组与通过[[Special:ReplaceText|替换文本]]进行的编辑。\n\n';
	text += '* 生成时间：{{subst:#time:Y年n月j日 (D) H:i (T)}}\n\n';
	text += '{| class="wikitable sortable" width=100%\n|-\n! 用户 !! 编辑数 !! 最后编辑时间\n';

	for (const user of users) {
		const contribs = await getContribs(user);
		if (!contribs.length) continue;
		const count = contribs.length;
		const latest = timestampCST(moment.max(contribs.map(e => moment(e.timestamp))));
		text += `|-\n| [[User:${user}|${user}]] || ${count} || ${latest}\n`;
	}

	text += '|}\n[[Category:Vocawiki数据报告]]';

	await api.postWithToken('csrf', {
		action: 'edit',
		title: 'Vocawiki:活跃用户编辑报告',
		text,
		summary: '更新数据报告',
		bot: true,
		nocreate: true,
		watchlist: 'nochange',
	});

	console.log(`End: ${new Date().toISOString()}`);
})();