from telethon import TelegramClient
import httpx
from dotenv import load_dotenv
import os
load_dotenv()
api_id = int(os.getenv("api_id"))
api_hash = os.getenv("api_hash")

# The first parameter is the .session file name (absolute paths allowed)
with TelegramClient('session_name', api_id, api_hash) as client:
    client.loop.run_until_complete(client.send_message('me', 'Hello, myself!'))