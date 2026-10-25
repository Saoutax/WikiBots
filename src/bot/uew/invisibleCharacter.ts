import { run, uewapi as api } from '@/api';
import { InvisibleCharacter } from '../modules';

(async () => {
    await run({ api, site: 'uew' }, async () => {
        await new InvisibleCharacter(api).main('invisibleCharacterUEW');
    });
})();
