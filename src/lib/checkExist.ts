import type { InfoPage } from 'types-mediawiki-response';
import { BaseApi } from '@/utils';

class CheckExist extends BaseApi {
    /**
     * 检查是否存在目标页面
     * @param title 页面标题
     * @returns 检查结果
     */
    check = async (title: string): Promise<boolean> => {
        const pages = await this.queryPages<InfoPage>({
            action: 'query',
            prop: 'info',
            titles: title,
        });
        return !pages[0]?.missing;
    };
}

export { CheckExist };
