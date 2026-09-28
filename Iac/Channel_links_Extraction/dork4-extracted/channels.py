import asyncio
from quart import Quart, request, jsonify
import os, re
from urllib.parse import quote
from dotenv import load_dotenv
from quart_cors import cors
from pyppeteer import launch
import logging
import atexit

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Quart(__name__)
app = cors(app, allow_origin="*")

load_dotenv()

browser_instance = None
browser_lock = asyncio.Lock()

# path = os.getenv("PUPPETEER_EXECUTABLE_PATH", "/usr/bin/chromium")
path = os.getenv("PUPPETEER_EXECUTABLE_PATH", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")

invalid_channels = set([
    # Invalid channels list
])

async def get_browser():
    global browser_instance
    if browser_instance is not None:
        proc = getattr(browser_instance, "process", None)
        if proc is not None and proc.poll() is not None:
            logger.warning("[get_browser] Chromium process died; relaunching.")
            browser_instance = None
    if browser_instance is None:
        async with browser_lock:
            if browser_instance is None:  
                logger.info("[get_browser] Launching browser...")
                browser_instance = await launch(
                    executablePath=path,
                    args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-extensions", "--disable-infobars", "--disable-notifications"]
                )
                logger.info("[get_browser] Browser launched.")
    return browser_instance

# Pulls each CSE result card and pairs every link inside it with that card's
# title + meta description (the .gs-snippet text shown under the hyperlink).
EXTRACT_RESULTS_JS = """() => {
    const usable = (a) => a.href && a.href.trim() !== '' && !a.href.startsWith('javascript:');
    const out = [];

    document.querySelectorAll('.gsc-webResult.gsc-result, .gsc-imageResult').forEach(card => {
        const snippetEl = card.querySelector('.gs-snippet');
        const titleEl = card.querySelector('a.gs-title');
        const description = snippetEl ? snippetEl.innerText.trim() : '';
        const title = titleEl ? titleEl.innerText.trim() : '';
        card.querySelectorAll('a').forEach(a => {
            if (usable(a)) out.push({ url: a.href, title: title, description: description });
        });
    });

    // ponytail: fallback to the old all-anchors sweep if the CSE markup ever changes,
    // so a DOM change degrades to "names, no descriptions" instead of returning nothing.
    if (out.length === 0) {
        document.querySelectorAll('a').forEach(a => {
            if (usable(a)) out.push({ url: a.href, title: '', description: '' });
        });
    }

    return out;
}"""

def cse_url(search_query, page_num):
    # quote() matters: an unencoded "&" in the term truncates the CSE fragment,
    # so "AT&T" would silently search for '"AT' and return confident, wrong results.
    return (f"https://cse.google.com/cse?&cx=006368593537057042503:efxu7xprihg"
            f"#gsc.tab=0&gsc.q={quote(search_query)}&gsc.sort=date&gsc.page={page_num}")

async def scrape_page(browser, search_query, page_num):
    print(f"Scraping page {page_num} for query '{search_query}'...")
    page = await browser.newPage()
    s_url = cse_url(search_query, page_num)
    print(f"Navigating to {s_url}")
    await page.goto(s_url, {"waitUntil": "networkidle2"})
    results = await page.evaluate(EXTRACT_RESULTS_JS)
    await page.close()
    with_desc = sum(1 for r in results if r.get("description"))
    print(f"Scraped {len(results)} links from page {page_num} ({with_desc} with a description).")
    return results

async def scrape_links(search_query, num_pages=2):
    print(f"Starting link scraping for query '{search_query}'...")
    browser = await get_browser()

    tasks = [scrape_page(browser, search_query, page_num) for page_num in range(1, num_pages + 1)]
    all_results = await asyncio.gather(*tasks)

    # Flatten the list of lists into a single list
    scraped = [r for sublist in all_results for r in sublist]

    print(f"Total scraped links: {len(scraped)}")
    return scraped

# Same three sources as before, one regex each; first match wins.
CHANNEL_PATTERNS = (
    re.compile(r"tgstat\.com/.*?@([^/?#]+)"),
    re.compile(r"https?://(?:t\.me|telegram\.me)/s/([^/?#]+)"),
    re.compile(r"telemetr\.io/\w+/channels/\d+-(\w+)"),
)

def channel_name_from_url(url):
    for pattern in CHANNEL_PATTERNS:
        match = pattern.search(url)
        if match:
            return match.group(1)
    return None

async def retrieve_channels(search_query, include_keywords=None, exclude_keywords=None):
    print(f"Retrieving channels for query '{search_query}'...")
    try:
        query_parts = [f'"{search_query}"']

        if include_keywords:
            includes = " OR ".join([f'"{kw.strip()}"' for kw in include_keywords if kw.strip()])
            if includes:
                query_parts.append(f'AND ({includes})')

        if exclude_keywords:
            excludes = " ".join([f'-{kw.strip()}' for kw in exclude_keywords if kw.strip()])
            if excludes:
                query_parts.append(excludes)

        modified_query1 = " ".join(query_parts)
        print(f"Constructed Query: {modified_query1}")

        scraped = await scrape_links(modified_query1)

        # Dedupe by channel name, keeping the richest description we saw for it.
        channels = {}
        for item in scraped:
            name = channel_name_from_url(item["url"])
            if not name or name in invalid_channels:
                continue
            existing = channels.get(name)
            if existing is None or len(item["description"]) > len(existing["description"]):
                channels[name] = {
                    "name": name,
                    "title": item["title"],
                    "description": item["description"],
                    "url": item["url"],
                }

        result = list(channels.values())
        print(f"Valid channels retrieved: {len(result)} ({sum(1 for c in result if c['description'])} with descriptions)")
        return result
    except Exception as e:
        print(f"Error retrieving channels: {e}")
        return []

@app.route("/")
async def home():
    print("Endpoint '/' called.")
    return jsonify("Healthcheck")

@app.route("/api/retrieve-channel-names", methods=["POST"])
async def retrieve_channel_names():
    print("Endpoint '/api/retrieve-channel-names' called.")
    
    if request.is_json:
        data = await request.get_json()
    else:
        data = await request.form
        
    search_query = data.get("search_query", "")

    if not search_query:
        return jsonify({"error": "search_query input is missing"}), 400

    include_keywords = data.get("include_keywords", [])
    if isinstance(include_keywords, str):
        include_keywords = [kw.strip() for kw in include_keywords.split(",") if kw.strip()]

    exclude_keywords = data.get("exclude_keywords", [])
    if isinstance(exclude_keywords, str):
        exclude_keywords = [kw.strip() for kw in exclude_keywords.split(",") if kw.strip()]

    try:
        channels = await retrieve_channels(search_query, include_keywords, exclude_keywords)
        # channel_names kept so anything still on the old contract keeps working.
        return jsonify({
            "channel_names": [c["name"] for c in channels],
            "channels": channels,
        }), 200
    except Exception as e:
        print(f"Error in /api/retrieve-channel-names: {e}")
        return jsonify({"error": "Internal Server Error"}), 500

def cleanup():
    if browser_instance:
        logger.info("[cleanup] Closing browser instance.")
        asyncio.run(browser_instance.close())

atexit.register(cleanup)

if __name__ == "__main__":
    logger.info("Starting channels.py Quart app...")
    app.run(host="0.0.0.0", port=5001)