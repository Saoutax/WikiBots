import { BaseApi } from '@/utils';

interface MWPage {
    missing?: boolean;
}

class CheckExist extends BaseApi {
    /**
     * 检查是否存在目标页面
     * @param title 页面标题
     * @returns 检查结果
     */
    check = async (title: string) => {
        const pages = await this.queryPages<MWPage>({
            action: 'query',
            prop: 'info',
            titles: title,
        });
        return !pages[0]?.missing;
    };
}

export { CheckExist };
