import asyncio
from quart import Quart, request, jsonify
from quart_cors import cors
from pyppeteer import launch
from dotenv import load_dotenv

app = Quart(__name__)
app = cors(app, allow_origin="*")

load_dotenv()

browser_instance = None
browser_lock = asyncio.Lock()

async def get_browser():
    global browser_instance
    async with browser_lock:
        if browser_instance is None:
            browser_instance = await launch(
                # executablePath='/usr/bin/google-chrome',
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-extensions", "--disable-infobars", "--disable-notifications"]
            )
        return browser_instance

async def scrape_page(browser, search_query, page_num):
    page = await browser.newPage()
    s_url = f"https://cse.google.com/cse?cx=c400b8d7510234565#gsc.tab=0&gsc.q={search_query}&gsc.sort=date&gsc.page={page_num}"
    print(s_url)
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
    
    await page.close()
    return scraped_data

async def scrape_links(search_query, num_pages=2):
    browser = await get_browser()
    tasks = [scrape_page(browser, search_query, page_num) for page_num in range(1, num_pages + 1)]
    all_links = await asyncio.gather(*tasks)

    # Flatten the list of lists into a single list
    scraped_links = [link for sublist in all_links for link in sublist]
    return scraped_links

@app.route('/scrape', methods=['GET'])
async def scrape():
    search_query = request.args.get('query', '')
    num_pages = int(request.args.get('pages', '2'))

    if not search_query:
        return jsonify({"error": "Search query is required"}), 400

    scraped_data = await scrape_links(search_query, num_pages)
    return jsonify(scraped_data)

if __name__ == '__main__':
    app.run()