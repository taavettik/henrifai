import htmlToImage from 'node-html-to-image';
import { promises as fs } from 'fs';
import { AllMiddlewareArgs, App, SlackCommandMiddlewareArgs } from '@slack/bolt';
import { upload } from './imgur';
import { config } from './config';

type WebClient = AllMiddlewareArgs['client'];

class Henrifai {
  template?: string;
  emojis?: Record<string, string>;

  constructor() {
    this.init();
  }

  async init() {
    this.template = await fs.readFile('./template.html', 'utf8');
  }

  async fetchEmojis(client: WebClient) {
    const emojis = await client.emoji.list();

    if (!('emoji' in emojis)) {
      throw new Error(`Fetching emojis failed`)
    }
    this.emojis = emojis.emoji as Record<string, string>;
  }

  parseMessage(text: string) {
    const blocks = text.split(/(:.*?:)/g);
    const parsed = blocks.reduce((str, block) => {
      const emoji = block.match(/:(.*?):/)?.[1];
      if (!emoji) {
        return `${str}${block}`;
      }
      const url = this.emojis?.[emoji];
      if (!url) {
        return `${str}${block}`;
      }
      const html = `<img class="emoji" src="${url}" />`;
      return `${str}${html}`;
    }, '');

    return parsed;
  }

  async generate(client: WebClient, text: string) {
    if (!this.emojis) {
      await this.fetchEmojis(client);
    }
    
    if (!this.template) {
      return undefined;
    }

    return htmlToImage({
      html: this.template,
      content: {
        message: this.parseMessage(text),
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

    const img = await henrifai.generate(cmd.client, text);

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

