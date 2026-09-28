import asyncio
import logging
from quart import Quart, request, jsonify
from quart_cors import cors
from pyppeteer import launch
from dotenv import load_dotenv

# Set up basic logging configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Quart(__name__)
app = cors(app, allow_origin="*")

load_dotenv()

browser_instance = None
browser_lock = asyncio.Lock()

async def get_browser():
    global browser_instance
    async with browser_lock:
        if browser_instance is None:
            logger.info("Launching a new browser instance...")
            try:
                browser_instance = await launch(
                executablePath='/usr/bin/google-chrome',
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-extensions", "--disable-infobars", "--disable-notifications"])
                logger.info("Browser instance launched successfully.")
            except Exception as e:
                logger.error(f"Error launching browser: {e}")
                raise e
        else:
            logger.info("Reusing existing browser instance.")
        return browser_instance

async def scrape_page(browser, search_query, page_num):
    logger.info(f"Scraping page {page_num} for query '{search_query}'...")
    page = await browser.newPage()
    try:
        s_url = f"https://cse.google.com/cse?cx=c400b8d7510234565#gsc.tab=0&gsc.q={search_query}&gsc.sort=date&gsc.page={page_num}"
        logger.info(f"Generated URL: {s_url}")
        await page.goto(s_url, {"waitUntil": "networkidle0"})

        scraped_data = await page.evaluate(
            """() => {
                const results = [];
                const elements = document.querySelectorAll('.gsc-webResult.gsc-result');
                elements.forEach(element => {
                    const titleNode = element.querySelector('.gs-title a');
                    const title = titleNode ? titleNode.innerText : '';
                    const link = titleNode ? titleNode.href : '';
                    const descriptionNode = element.querySelector('.gs-snippet');
                    const description = descriptionNode ? descriptionNode.innerText : '';
                    if (title && link) {
                        results.push({title, link, description});
                    }
                });
                return results;
            }"""
        )
        logger.info(f"Scraped {len(scraped_data)} results from page {page_num}.")
    except Exception as e:
        logger.error(f"Error scraping page {page_num}: {e}")
        scraped_data = []
    finally:
        await page.close()
    return scraped_data

async def scrape_links(search_query, num_pages=2):
    logger.info(f"Starting scrape for query '{search_query}' over {num_pages} pages...")
    browser = await get_browser()
    tasks = [scrape_page(browser, search_query, page_num) for page_num in range(1, num_pages + 1)]
    
    try:
        all_links = await asyncio.gather(*tasks)
        logger.info(f"Scraped data from {num_pages} pages successfully.")
    except Exception as e:
        logger.error(f"Error scraping links: {e}")
        all_links = []

    # Flatten the list of lists into a single list
    scraped_links = [link for sublist in all_links for link in sublist]
    logger.info(f"Total {len(scraped_links)} links scraped.")
    return scraped_links


@app.route('/', methods=['GET'])
async def home():
    logger.info("Home endpoint accessed.")
    return jsonify({"message": "Hello, World!"})


@app.route('/scrape', methods=['GET'])
async def scrape():
    logger.info("Scrape endpoint accessed.")
    search_query = request.args.get('query', '')
    num_pages = int(request.args.get('pages', '2'))

    if not search_query:
        logger.warning("Search query is missing in the request.")
        return jsonify({"error": "Search query is required"}), 400

    logger.info(f"Received scrape request with query '{search_query}' and {num_pages} pages.")
    scraped_data = await scrape_links(search_query, num_pages)
    logger.info(f"Returning scraped data with {len(scraped_data)} results.")
    return jsonify(scraped_data)

if __name__ == '__main__':
    logger.info("Starting Quart app on port 5100...")
    app.run(host='0.0.0.0', port=5100)