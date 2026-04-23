import { vjpapi as api, Login } from '@/api';

interface PageInfo {
    title: string;
    protection: Array<{
        type: 'edit' | 'move';
        expiry: string;
        level: string;
    }>;
}

interface QueryPageResult {
    title: string;
    value: number;
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'vjp', account: 'bot' });

    const {
        data: {
            query: { pages },
        },
    } = await api.post<{ query: { pages: PageInfo[] } }>({
        prop: 'info',
        generator: 'querypage',
        inprop: 'protection',
        gqppage: 'Mostlinkedtemplates',
        gqplimit: 'max',
    });
    const {
        data: {
            query: {
                querypage: { results },
            },
        },
    } = await api.post<{ query: { querypage: { results: QueryPageResult[] } } }>({
        list: 'querypage',
        qppage: 'Mostlinkedtemplates',
        qplimit: 'max',
    });

    let text =
        '* 本页面由[[U:MisakaNetwork|机器人]]根据[[Special:MostTranscludedPages]]生成的页面保护信息，以供管理员检查。仅统计使用量大于100的页面。\n';
    text +=
        '* 生成时间：{{subst:#time:Y年n月j日 (D) H:i (T)}}｜{{subst:#time:Y年n月j日 (D) H:i (T)|||1}}\n\n';
    text += '{| class="wikitable sortable center plainlinks"\n';
    text += '|-\n! 序号 !! 页面名 !! 使用量 !! 编辑 !! 移动 !! 操作\n';
    let count = 1;
    for (const item of results) {
        const { title, value } = item;
        if (value <= 100) {
            continue;
        }
        const match = pages.find((page: PageInfo) => page.title === title);
        if (!match) {
            continue;
        }
        const { protection } = match;
        const levelStr: Record<'edit' | 'move', string> = { edit: ' - ||', move: ' - ||' };
        for (const option of protection) {
            const { type, expiry, level } = option;
            if (type === 'edit' || type === 'move') {
                levelStr[type] =
                    expiry === 'infinity' ? ` {{int:Protect-level-${level}}} ||` : ' - ||';
            }
        }
        const linkText = `[{{canonicalurl:${title}|action=edit}} 编辑]｜[{{canonicalurl:${title}|action=history}} 历史]<span class="sysop-show">｜[{{canonicalurl:${title}|action=protect}} 保护]</span>`;
        text += `|-\n| ${count} || [[${title}]] || ${value} || ${levelStr.edit + levelStr.move + linkText}\n`;
        count++;
    }
    text += '|}\n\n[[Category:Vocawiki数据报告]]';

    await api
        .postWithToken(
            'csrf',
            {
                action: 'edit',
                pageid: '63794',
                text,
                summary: '更新数据报告',
                bot: true,
                notminor: true,
                tags: 'Bot',
                watchlist: 'nochange',
            },
            {
                retry: 50,
                noCache: true,
            },
        )
        .then(() => {
            console.log('Done.');
        });

    console.log(`End time: ${new Date().toISOString()}`);
})();
