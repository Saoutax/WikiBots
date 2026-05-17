/**
 * 添加延时
 *
 * @param time 延时时间，默认为 3000 毫秒
 */
const delay = async (time = 3000) => {
    await new Promise(resolve => {
        setTimeout(resolve, time);
    });
};

export { delay };
