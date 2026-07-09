import { BaseApi } from '@/utils';

class CheckExist extends BaseApi {
    /**
     * 检查是否存在目标页面
     * @param title 页面标题
     * @returns 检查结果
     */
    check = async (title: string) => {
        const {
            data: {
                query: { pages },
            },
        } = await this.api.post({
            action: 'query',
            format: 'json',
            prop: 'info',
            titles: title,
            formatversion: '2',
        });
        return pages[0]?.missing ? false : true;
    };
}

export { CheckExist };
