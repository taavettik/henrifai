import htmlToImage from 'node-html-to-image';
import { promises as fs } from 'fs';
import { SlackAdapter } from 'botbuilder-adapter-slack';
import { Botkit } from 'botkit';
import { App, SlackCommandMiddlewareArgs } from '@slack/bolt';
import { upload } from './imgur';
import { config } from './config';

class Henrifai {
  template?: string;
  emojis?: Record<string, string>;

  constructor() {
    this.init();
  }

  async init() {
    this.template = await fs.readFile('./template.html', 'utf8');
  }

  async generate(cmd: SlackCommandMiddlewareArgs, text: string) {
    if (!this.template) {
      return undefined;
    }

    return htmlToImage({
      html: this.template,
      content: {
        message: text
      },
    }) as Promise<Buffer>;
  }
}

const app = new App({
  token: config.botToken,
  appToken: config.appToken,
  signingSecret: config.clientSigningSecret,
  socketMode: true,
});

(async () => {
  // Start your app
  await app.start(3000);

  console.log('⚡️ Bolt app is running!');
})();

const henrifai = new Henrifai();

app.command('/henrifai', async (cmd) => {
  try {
    cmd.ack();

    const text = cmd.body.text;
    const emojis = await cmd.client.emoji.list();

    if (!text) {
      return;
    }

    const img = await henrifai.generate(cmd, text);

    if (!img) {
      return;
    }

    const link = await upload(img.toString('base64'));
    await cmd.respond({
      text: link,
      unfurl_links: true,
      unfurl_media: true,
      attachments: [{
        text: '',
        image_url: link,
        thumb_url: link
      }]
    });
  } catch (e) {
    console.error(e);
  }
})

