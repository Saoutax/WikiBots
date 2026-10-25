import { run, vjpapi as api } from '@/api';
import { InvisibleCharacter } from '../modules';

(async () => {
    await run({ api, site: 'vjp' }, async () => {
        await new InvisibleCharacter(api).main(
            'invisibleCharacterVJP',
            'User:SaoMikoto/Bot/config/invisibleCharacter.json',
        );
    });
})();
