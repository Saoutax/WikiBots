import { uewapi as api, Login } from '@/api';
import { InvisibleCharacter } from '../modules';

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'uew', account: 'bot' });

    await new InvisibleCharacter(api).main('invisibleCharacterUEW');

    console.log(`End time: ${new Date().toISOString()}`);
})();
