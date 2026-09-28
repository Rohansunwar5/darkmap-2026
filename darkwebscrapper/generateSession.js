const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input'); // npm install input

const apiId = parseInt(process.env.API_ID, 10);
const apiHash = process.env.API_HASH;

(async () => {
  console.log('Starting Telegram client...');
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {});

  await client.start({
    phoneNumber: async () => await input.text('Please enter your phone number: '),
    password: async () => await input.text('Please enter your password (if 2FA is enabled): '),
    phoneCode: async () => await input.text('Please enter the code you received: '),
    onError: (err) => console.log(err),
  });

  console.log('Logged in successfully!');
  console.log('Session string:', client.session.save());
})();