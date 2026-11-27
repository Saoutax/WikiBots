import { vjpapi as api } from '@/api';
import { run } from '@/runner';
import { InvisibleCharacter } from '@/tasks';

(async () => {
    await run(
        { api, site: 'vjp' },
        async () => {
            await new InvisibleCharacter(api).main(
                'invisibleCharacterVJP',
                'User:SaoMikoto/Bot/config/invisibleCharacter.json',
            );
        },
        true,
    );
})();
