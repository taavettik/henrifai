import secrets from '../secrets.json';

export const config = {
  botToken: secrets.BOT_TOKEN,
  appToken: secrets.APP_TOKEN,
  clientSigningSecret: secrets.CLIENT_SIGNING_SECRET,
  imgurClientId: secrets.IMGUR_CLIENT_ID,
  emojiJsonUrl:
    'https://raw.githubusercontent.com/iamcal/emoji-data/master/emoji.json',
};
