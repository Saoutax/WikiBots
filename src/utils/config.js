import { env } from 'process';

const config = {
	useragent: `${env.API_USER_AGENT} (Github Actions; Saoutax-bot) `,
	zh: {
		api: "https://mzh.moegirl.org.cn/api.php",
		bot: {
			name: "机娘亚衣琴@saoutaxbot",
			password: env.ZH_BOT,
		},
		main: {
			name: "SaoMikoto@SaoMikoto",
			password: env.ZH_MAIN,
		},
	},
	cm: {
		api: "https://commons.moegirl.org.cn/api.php",
		bot: {
			name: "机娘亚衣琴@saoutaxbot",
			password: env.CM_BOT,
		},
		main: {
			name: "SaoMikoto@SaoMikoto",
			password: env.CM_MAIN,
		},
	},
	vjp: {
		api: 'https://voca.wiki/api.php',
		bot: {
			name: 'MisakaNetwork@MisakaNetwork',
			password: env.VJP_BOT,
		},
		main: {
			name: 'SaoMikoto@saomikoto',
			password: env.VJP_MAIN,
		},
	},
};

export default config;