import fetch from 'node-fetch';

export default async function handler(req, res) {
  const url = 'https://api.tgdev.io/tgscan/v1/search';

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        ...req.headers,
        host: new URL(url).host,
      },
      body: req.method !== 'GET' ? req.body : undefined,
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
