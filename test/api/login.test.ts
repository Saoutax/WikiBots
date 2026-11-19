import { describe, it, expect, vi } from 'vitest';
import config from '@/api/config';
import { Login } from '@/api/login';
import { createApiStub } from '../helpers/api';

const zhBot = config.zh.accounts['bot'];

describe('Login', () => {
    it('合法账号按配置调用 api.login 并输出站点名', async () => {
        const stub = createApiStub();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        stub.login.mockResolvedValue({ lgusername: '机娘亚衣琴@saoutaxbot' });

        const result = await new Login(stub.api).login({ site: 'zh', account: 'bot' });

        expect(result).toEqual({ lgusername: '机娘亚衣琴@saoutaxbot' });
        expect(stub.login).toHaveBeenCalledTimes(1);
        expect(stub.login).toHaveBeenCalledWith(zhBot?.name, zhBot?.password, undefined, {
            retry: 25,
            noCache: true,
        });
        expect(log).toHaveBeenCalledTimes(1);
        expect(String(log.mock.calls[0]?.[0])).toContain('MoegirlPedia(zh)');
    });

    it('无效账号抛出 Invalid account 且不调用 api.login', async () => {
        const stub = createApiStub();
        vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(new Login(stub.api).login({ site: 'zh', account: 'ibot' })).rejects.toThrow(
            'Invalid account: ibot',
        );
        expect(stub.login).not.toHaveBeenCalled();
    });
});
