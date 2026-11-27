import { uewapi as api } from '@/api';
import { run } from '@/runner';
import { InvisibleCharacter } from '@/tasks';

(async () => {
    await run({ api, site: 'uew' }, async () => {
        await new InvisibleCharacter(api).main('invisibleCharacterUEW');
    });
})();
