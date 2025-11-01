import { MediaWikiApi } from 'wiki-saikou';
import config from './utils/config.js';
import moment from 'moment';

const api = new MediaWikiApi(config.vjp.api, {
	headers: { 'user-agent': config.useragent },
});

const now = moment.utc();
const start = now.toISOString();
const end = now.clone().subtract(30, 'days').toISOString();

const timestampCST = ts => moment(ts).utcOffset(8).format('YYYY-MM-DD HH:mm:ss (CST)');

async function getRecentChanges() {
	const users = new Map();
	let cont;
	do {
		const { data } = await api.post({
			list: 'recentchanges',
			rcprop: 'user|timestamp|comment',
			rcshow: '!bot',
			rctype: 'edit|new',
			rclimit: 'max',
			rcstart: start,
			rcend: end,
			rccontinue: cont,
		});
		const list = data?.query?.recentchanges;
		if (!list?.length) {
			break;
		}

		for (const rc of list) {
			if (/文字替换/.test(rc.comment || '')) {
				continue;
			}
			const user = rc.user;
			const ts = moment(rc.timestamp);
			if (!users.has(user)) {
				users.set(user, { count: 0, latest: ts });
			}
			const u = users.get(user);
			u.count++;
			if (ts.isAfter(u.latest)) {
				u.latest = ts;
			}
		}

		cont = data.continue?.rccontinue;
	} while (cont);
	return users;
}

(async () => {
	console.log(`Start: ${new Date().toISOString()}`);

	await api.login(
		config.vjp.bot.name,
		config.vjp.bot.password,
		undefined,
		{ retry: 25, noCache: true },
	).then(console.log);

	const users = await getRecentChanges();

	let text = '* 本页面是由[[U:MisakaNetwork|机器人]]生成活跃用户近30日内的编辑统计。\n';
	text += '* 不包含机器人用户组与通过[[Special:ReplaceText|替换文本]]进行的编辑。\n';
	text += '* 生成时间：{{subst:#time:Y年n月j日 (D) H:i (T)|||1}}\n\n';
	text += '{| class="wikitable sortable" width=100%\n|-\n! 用户 !! 编辑数 !! 最后编辑时间\n';

	for (const [user, info] of users.entries()) {
		text += `|-\n| [[User:${user}|${user}]] || ${info.count} || ${timestampCST(info.latest)}\n`;
	}

	text += '|}\n[[Category:Vocawiki数据报告]]';

	await api.postWithToken('csrf', {
		action: 'edit',
		title: 'Vocawiki:活跃用户编辑报告',
		text,
		summary: '更新数据报告',
		tags: 'Bot',
		bot: true,
		nocreate: true,
		watchlist: 'nochange',
	});

	console.log(`End: ${new Date().toISOString()}`);
})();