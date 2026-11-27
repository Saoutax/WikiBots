import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLogCapture, tailLog } from '@/infra/logCapture';

describe('startLogCapture', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('捕获 log/info/warn/error 输出并透传到原 console，restore 后不再捕获', () => {
        const origLog = vi.spyOn(console, 'log').mockImplementation(() => {});
        const origInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
        const origWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const origError = vi.spyOn(console, 'error').mockImplementation(() => {});

        const capture = startLogCapture();
        console.log('hello %s', 'world');
        console.info('info line');
        console.warn('warn line');
        console.error('error line');

        expect(origLog).toHaveBeenCalledWith('hello %s', 'world');
        expect(origInfo).toHaveBeenCalledWith('info line');
        expect(origWarn).toHaveBeenCalledWith('warn line');
        expect(origError).toHaveBeenCalledWith('error line');
        expect(capture.text()).toBe('hello world\ninfo line\nwarn line\nerror line');

        capture.restore();
        console.log('after restore');
        expect(capture.text()).toBe('hello world\ninfo line\nwarn line\nerror line');
    });

    it('超出 maxLines 或 maxBytes 时只保留尾部日志', () => {
        vi.spyOn(console, 'log').mockImplementation(() => {});

        const capture = startLogCapture({ maxLines: 3, maxBytes: 25 });
        console.log('line-1');
        console.log('line-2');
        console.log('line-3');
        console.log('line-4');

        const lines = capture.text().split('\n');
        expect(lines.length).toBeLessThanOrEqual(3);
        expect(lines.at(-1)).toBe('line-4');

        capture.restore();
    });
});

describe('tailLog', () => {
    it('按行数与字节数截断并标记 truncated', () => {
        const { tail, truncated } = tailLog('a\nb\nc\nd', 2, 100);
        expect(tail).toBe('c\nd');
        expect(truncated).toBe(true);
    });
});
