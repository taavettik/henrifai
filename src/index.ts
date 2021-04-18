import htmlToImage from 'node-html-to-image';
import { promises as fs } from 'fs';
import {
  AllMiddlewareArgs,
  App,
  SlackCommandMiddlewareArgs,
} from '@slack/bolt';
import { upload } from './imgur';
import { config } from './config';
import crypto from 'crypto';
import express from 'express';
import axios from 'axios';
import hbs from 'handlebars';

type WebClient = AllMiddlewareArgs['client'];

function formatTime(date: Date) {
  return `${date
    .getHours()
    .toString()
    .padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function usernameToColor(username: string) {
  const lastName = username.split('.').slice(-1)[0] ?? '';

  let color = '';
  for (let i = 0; i < 3; i++) {
    const code = lastName.charCodeAt(i);
    if (Number.isNaN(code)) {
      continue;
    }
    const hex = code.toString(16).padStart(2, '0');
    color += hex;
  }
  return `#${color.padStart(6, '0')}`;
}

function hashUsername(username: string) {
  const hash = crypto.createHash('sha1');
  hash.update(username);
  return hash.digest('hex');
}

class Henrifai {
  template?: string;
  emojis?: Record<string, string>;
  defaultEmojis: Record<string, string> = {};

  constructor() {
    this.init();
  }

  async init() {
    this.template = await fs.readFile('./template.html', 'utf8');
    await this.fetchDefaultEmojis();
  }

  async fetchDefaultEmojis() {
    const res = await axios.get(config.emojiJsonUrl);
    const emojis = (res.data as any[]).reduce((obj, cur) => {
      // some emojis are constisted of more than one characters
      const parts = cur.unified.split('-') as string[];

      return {
        ...obj,
        [cur.short_name]: parts.map((part) => `&#x${part}`).join(''),
      };
    }, {} as Record<string, string>);
    this.defaultEmojis = emojis;
  }

  async fetchEmojis(client: WebClient) {
    const emojis = await client.emoji.list();

    if (!('emoji' in emojis)) {
      throw new Error(`Fetching emojis failed`);
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
      const emojiChar = this.defaultEmojis[emoji];
      const url = this.emojis?.[emoji];
      if (!url && !emojiChar) {
        return `${str}${block}`;
      }
      // this is a span to make teemu angry
      const html = `<span class="emoji" style="background-image: url(${url})"></span>`;
      return `${str}${emojiChar ? emojiChar : html}`;
    }, '');

    return parsed;
  }

  async generateHtml(message: string, clean = false) {
    if (!this.template || clean) {
      await this.init();
    }

    if (!this.template) {
      throw new Error('this should never happen');
    }

    const render = hbs.compile(this.template);

    return render({ message, time: formatTime(new Date()) });
  }

  async generate(senderUsername: string, text: string, client?: WebClient) {
    if (!this.emojis && client) {
      await this.fetchEmojis(client);
    }

    if (!this.template) {
      return undefined;
    }

    const now = new Date();

    return htmlToImage({
      html: this.template,
      content: {
        message: this.parseMessage(text),
        time: formatTime(now),
        watermarkColor: usernameToColor(senderUsername),
      },
    }) as Promise<Buffer>;
  }
}

const henrifai = new Henrifai();

const server = express();

server.get(`/`, async (req, res) => {
  const { message } = req.query;

  const img = await henrifai.generate('dev', `${message}`);
  res.contentType('image/png');
  res.send(img);
});

server.get('/html', async (req, res) => {
  const { message } = req.query;

  const html = await henrifai.generateHtml(`${message}`, true);

  res.send(html ?? '');
});

server.listen(3000);

const app = new App({
  token: config.botToken,
  appToken: config.appToken,
  signingSecret: config.clientSigningSecret,
  socketMode: true,
});

(async () => {
  // Start your app
  await app.start();

  console.log('⚡️ Bolt app is running!');
})();

app.command('/henrifai', async (cmd) => {
  try {
    cmd.ack();

    const text = cmd.body.text;

    if (!text) {
      return;
    }

    const img = await henrifai.generate(
      cmd.command.user_name,
      text,
      cmd.client
    );

    if (!img) {
      return;
    }

    const link = await upload(
      img.toString('base64'),
      hashUsername(cmd.command.user_name)
    );
    await cmd.respond({
      text: link,
      unfurl_links: true,
      unfurl_media: true,
      attachments: [
        {
          text: '',
          image_url: link,
          thumb_url: link,
        },
      ],
    });
  } catch (e) {
    console.error(e);
  }
});
