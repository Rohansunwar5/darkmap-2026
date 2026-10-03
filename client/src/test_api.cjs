const axios = require('axios');
const BASE_URL = 'https://api.darkmap.org';

async function test() {
  try {
    const res = await axios.post(`${BASE_URL}/telegram/channel-messages`, {
      search_query: 'apk sbi',
      channel_name: 'test',
      include: ['sbi']
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(res.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
  }
}
test();
