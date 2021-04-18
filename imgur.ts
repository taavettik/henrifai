import axios from 'axios';
import { config } from './config';

const api = axios.create({
  baseURL: 'https://api.imgur.com/3/upload',
  headers: {
    Authorization: `Client-ID ${config.imgurClientId}`,
  },
});

export async function upload(base64: string, title?: string) {
  const res = await api.post('/upload', {
    image: base64,
    title,
    type: 'base64',
  });

  return res.data?.data?.link as string;
}
