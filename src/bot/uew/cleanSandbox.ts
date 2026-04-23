import { uewapi as api, Login } from '@/api';
import { CleanSandbox } from '../modules';

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'uew', account: 'bot' });

    await new CleanSandbox(api).main({
        '帮助:沙盒': {
            content:
                '<noinclude><!-- 请勿删除此行 -->{{沙盒页顶}}<!-- Please do not delete this line --></noinclude>\n== 请在这行文字底下开始测试 ==',
            summary:
                '沙盒清理作业，若想保留较长时间，可在[[Special:MyPage/Sandbox|个人沙盒]]进行测试，或查阅页面历史并再次编辑本页。',
        },
        '模板:沙盒': {
            content:
                '<noinclude><!-- 请勿删除此行 -->{{沙盒页顶}}<!-- Please do not delete this line --></noinclude>',
            summary:
                '沙盒清理作业，若想保留较长时间，可在[[Special:MyPage/Sandbox|个人沙盒]]进行测试，或查阅页面历史并再次编辑本页。',
        },
        '帮助:沙盒/style.css': {
            content: '',
            summary:
                '沙盒清理作业，若想保留较长时间，可在[[Special:MyPage/Sandbox|个人沙盒]]进行测试，或查阅页面历史并再次编辑本页。',
        },
        '模板:沙盒/style.css': {
            content: '/* [[Category:位于模板命名空间下的CSS页面]] */',
            summary:
                '沙盒清理作业，若想保留较长时间，可在[[Special:MyPage/Sandbox|个人沙盒]]进行测试，或查阅页面历史并再次编辑本页。',
        },
    });

    console.log(`End time: ${new Date().toISOString()}`);
})();
