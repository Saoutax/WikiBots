import { delay as esDelay } from 'es-toolkit';

/**
 * 添加延时
 *
 * @param time - 延时时间，默认为 3000 毫秒
 */
const delay = (time = 3000): Promise<void> => esDelay(time);

export { delay };
