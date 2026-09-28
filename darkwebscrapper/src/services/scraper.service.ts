import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { TypeNotFoundError } from 'telegram/errors';
import { MessageRepository } from '../repository/message.repository';
import { config } from '../config';

// Utility delay function encapsulated inside the service
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class ScraperService {
  private _telegramClient!: TelegramClient;

  constructor(private readonly _messageRepository: MessageRepository) { }

  public async start(): Promise<void> {
    console.log("\n" + "=".repeat(60));
    console.log("🤖 FORWARD SCRAPER SERVICE STARTING (oldest → newest)");
    console.log("=".repeat(60) + "\n");

    const channelUsername = 'breachdetect';

    while (true) {
      try {
        await this._connectTelegram();

        console.log("📢 Target Channel:", channelUsername);

        let currentMinId = 890464;
        try {
          const highestMid = await this._messageRepository.getHighestMid();
          if (highestMid) {
            currentMinId = highestMid;
            console.log(`📊 Resuming strictly after Mid: ${currentMinId}`);
          } else {
            console.log(`📊 DB empty. Starting from default: ${currentMinId}`);
          }
        } catch (err: any) {
          console.warn(`⚠️ Could not fetch highest Mid. Error: ${err.message}`);
        }

        const BATCH_SIZE = 100;
        const FETCH_LIMIT = 100;
        const MAX_CONSECUTIVE_ERRORS = 5;
        let consecutiveErrors = 0;
        let messagesToInsert: any[] = [];
        let totalSaved = 0;
        let totalSkipped = 0;
        let totalErrors = 0;

        console.log("\n🚀 Starting forward scraping cycle...");

        while (true) {
          try {
            console.log(`\n📥 Fetching up to ${FETCH_LIMIT} messages strictly after ID ${currentMinId}...`);

            let messages: any[] = [];
            let retries = 0;
            const MAX_RETRIES = 3;

            let skipBatch = false;
            while (retries < MAX_RETRIES && messages.length === 0) {
              try {
                const result = await this._telegramClient.getMessages(channelUsername, {
                  minId: currentMinId,
                  limit: FETCH_LIMIT,
                  reverse: true,
                });
                messages = Array.from(result);
                consecutiveErrors = 0;
                console.log(`✅ Fetched ${messages.length} messages`);
              } catch (fetchError: any) {
                if (fetchError instanceof TypeNotFoundError || fetchError.name === 'TypeNotFoundError') {
                  const skipTo = currentMinId + FETCH_LIMIT;
                  console.warn(
                    `⚠️ TypeNotFoundError (unknown TL constructor ${fetchError.invalidConstructorId}). ` +
                    `Skipping message range [${currentMinId}..${skipTo}] to avoid infinite loop.`
                  );
                  currentMinId = skipTo;
                  consecutiveErrors = 0;
                  skipBatch = true;
                  break;
                }
                retries++;
                console.log(`⚠️ Retry ${retries}/${MAX_RETRIES}... Error: ${fetchError.message}`);
                if (retries >= MAX_RETRIES) throw fetchError;
                await delay(5000 * retries);
              }
            }

            if (skipBatch) continue;

            if (messages.length === 0) {
              console.log("ℹ️ Caught up to latest! ⏸️ Pausing 2 minutes...");
              await delay(2 * 60 * 1000);

              const freshMax = await this._messageRepository.getHighestMid();
              if (freshMax) currentMinId = freshMax;
              continue;
            }

            let batchSaved = 0;
            let batchSkipped = 0;

            for (const msg of messages) {
              try {
                const isExisting = await this._messageRepository.messageExists(msg.id);

                if (isExisting) {
                  batchSkipped++;
                  totalSkipped++;
                } else if (msg.message) {
                  const messageDate = msg.date instanceof Date ? msg.date : new Date(msg.date * 1000);
                  messagesToInsert.push({
                    content: msg.message,
                    Mid: msg.id,
                    date: messageDate,
                  });
                  console.log(`   ➕ Queued ID ${msg.id} | Preview: "${msg.message.substring(0, 30)}..."`);
                } else {
                  batchSkipped++;
                  totalSkipped++;
                }

                if (messagesToInsert.length >= BATCH_SIZE) {
                  await this._safeInsertBatch(messagesToInsert);
                  batchSaved += messagesToInsert.length;
                  totalSaved += messagesToInsert.length;
                  messagesToInsert = [];
                }
              } catch (e: any) {
                console.error(`❌ Error parsing message ${msg.id}:`, e.message);
                totalErrors++;
              }
            }

            if (messagesToInsert.length > 0) {
              await this._safeInsertBatch(messagesToInsert);
              batchSaved += messagesToInsert.length;
              totalSaved += messagesToInsert.length;
              messagesToInsert = [];
            }

            console.log(`\n📈 Batch Summary: ✅ ${batchSaved} | ⏭️ ${batchSkipped}`);
            console.log(`📊 Total: ${totalSaved} saved, ${totalSkipped} skipped, ${totalErrors} errors`);

            const lastProcessedId = messages[messages.length - 1].id;
            if (lastProcessedId > currentMinId) {
              currentMinId = lastProcessedId;
            }

            console.log(`⏳ Waiting 2 minutes before next batch...`);
            await delay(2 * 60 * 1000);

          } catch (batchError: any) {
            consecutiveErrors++;
            console.error(`\n❌ Error in batch: ${batchError.message}`);
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              console.error("🛑 Breaking inner loop to reconnect...");
              break;
            }
            await delay(10000);
          }
        }
      } catch (fatalError: any) {
        console.error('\n💥 FATAL ERROR in scraper loop:', fatalError.message);
        try {
          if (this._telegramClient) await this._telegramClient.disconnect();
        } catch (e) { }
        console.log("⏳ Cooling down 30s before full restart...");
        await delay(30000);
      }
    }
  }

  // ====================================================================
  // BACKWARD-SCRAPING (newest → oldest) — commented out
  // ====================================================================
  /*
  public async startBackward(): Promise<void> {
    console.log("\n" + "=".repeat(60));
    console.log("🤖 BACKWARD SCRAPER SERVICE STARTING (newest → oldest)");
    console.log("=".repeat(60) + "\n");

    const channelUsername = 'breachdetect';

    while (true) {
      try {
        await this._connectTelegram();

        console.log("📢 Target Channel:", channelUsername);

        const BATCH_SIZE = 100;
        const FETCH_LIMIT = 30;
        const MAX_CONSECUTIVE_ERRORS = 5;
        let consecutiveErrors = 0;
        let messagesToInsert: any[] = [];
        let totalSaved = 0;
        let totalSkipped = 0;
        let totalErrors = 0;

        console.log("📡 Fetching latest message ID from channel...");
        const latestResult = await this._telegramClient.getMessages(channelUsername, { limit: 1 });
        const latestMessages = Array.from(latestResult);
        if (latestMessages.length === 0) {
          console.log("⚠️ Channel appears empty. Retrying in 2 minutes...");
          await delay(5 * 60 * 1000);
          continue;
        }
        const latestMid = (latestMessages[0] as any).id;
        let currentOffsetId = latestMid + 1;
        console.log(`📊 Channel latest message ID: ${latestMid}`);

        console.log("\n🚀 Starting backward scraping cycle (latest → oldest)...");

        while (true) {
          try {
            console.log(`\n📥 Fetching up to ${FETCH_LIMIT} messages backwards from ${currentOffsetId === 0 ? 'latest' : `ID ${currentOffsetId}`}...`);

            let messages: any[] = [];
            let retries = 0;
            const MAX_RETRIES = 3;

            let skipBatch = false;
            while (retries < MAX_RETRIES && messages.length === 0) {
              try {
                const params: any = { limit: FETCH_LIMIT };
                if (currentOffsetId > 0) {
                  params.offsetId = currentOffsetId;
                }

                const result = await this._telegramClient.getMessages(channelUsername, params);
                messages = Array.from(result);
                consecutiveErrors = 0;
                console.log(`✅ Fetched ${messages.length} messages`);
              } catch (fetchError: any) {
                if (fetchError instanceof TypeNotFoundError || fetchError.name === 'TypeNotFoundError') {
                  const skipTo = currentOffsetId > 0 ? currentOffsetId - FETCH_LIMIT : 0;
                  console.warn(
                    `⚠️ TypeNotFoundError (unknown TL constructor ${fetchError.invalidConstructorId}). ` +
                    `Skipping batch. New offset: ${skipTo > 0 ? skipTo : 'stop'}`
                  );
                  if (skipTo <= 0) {
                    skipBatch = true;
                    break;
                  }
                  currentOffsetId = skipTo;
                  consecutiveErrors = 0;
                  skipBatch = true;
                  break;
                }
                retries++;
                console.log(`⚠️ Retry ${retries}/${MAX_RETRIES}... Error: ${fetchError.message}`);
                if (retries >= MAX_RETRIES) throw fetchError;
                await delay(5000 * retries);
              }
            }

            if (skipBatch) continue;

            if (messages.length === 0) {
              console.log("ℹ️ Reached the beginning of the channel! All historical messages scraped.");
              console.log("🔄 Resetting to fetch from latest again in 2 minutes...");
              await delay(2 * 60 * 1000);
              currentOffsetId = 0;
              continue;
            }

            let batchSaved = 0;
            let batchSkipped = 0;

            for (const msg of messages) {
              try {
                const isExisting = await this._messageRepository.messageExists(msg.id);

                if (isExisting) {
                  batchSkipped++;
                  totalSkipped++;
                } else if (msg.message) {
                  const messageDate = msg.date instanceof Date ? msg.date : new Date(msg.date * 1000);
                  messagesToInsert.push({
                    content: msg.message,
                    Mid: msg.id,
                    date: messageDate,
                  });
                  console.log(`   ➕ Queued ID ${msg.id} | Preview: "${msg.message.substring(0, 30)}..."`);
                } else {
                  batchSkipped++;
                  totalSkipped++;
                }

                if (messagesToInsert.length >= BATCH_SIZE) {
                  await this._safeInsertBatch(messagesToInsert);
                  batchSaved += messagesToInsert.length;
                  totalSaved += messagesToInsert.length;
                  messagesToInsert = [];
                }
              } catch (e: any) {
                console.error(`❌ Error parsing message ${msg.id}:`, e.message);
                totalErrors++;
              }
            }

            if (messagesToInsert.length > 0) {
              await this._safeInsertBatch(messagesToInsert);
              batchSaved += messagesToInsert.length;
              totalSaved += messagesToInsert.length;
              messagesToInsert = [];
            }

            console.log(`\n📈 Batch Summary: ✅ ${batchSaved} | ⏭️ ${batchSkipped}`);
            console.log(`📊 Total: ${totalSaved} saved, ${totalSkipped} skipped, ${totalErrors} errors`);

            const oldestInBatch = messages[messages.length - 1].id;
            currentOffsetId = oldestInBatch;

            console.log(`⏳ Waiting 2 minutes before next batch...`);
            await delay(2 * 60 * 1000);

          } catch (batchError: any) {
            consecutiveErrors++;
            console.error(`\n❌ Error in batch: ${batchError.message}`);
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              console.error("🛑 Breaking inner loop to reconnect...");
              break;
            }
            await delay(10000);
          }
        }
      } catch (fatalError: any) {
        console.error('\n💥 FATAL ERROR in scraper loop:', fatalError.message);
        try {
          if (this._telegramClient) await this._telegramClient.disconnect();
        } catch (e) { }
        console.log("⏳ Cooling down 30s before full restart...");
        await delay(30000);
      }
    }
  }
  */

  private async _connectTelegram() {
    if (!this._telegramClient || !this._telegramClient.connected) {
      console.log("\n🔌 Connecting Telegram...");
      const apiId = parseInt(process.env.API_ID || '0', 10);
      const stringSession = new StringSession(process.env.TELEGRAM_SESSION || '');

      this._telegramClient = new TelegramClient(
        stringSession,
        apiId,
        process.env.API_HASH || '',
        {
          connectionRetries: 10,
          requestRetries: 5,
          autoReconnect: true,
          timeout: 120000,
          floodSleepThreshold: 60,
          useWSS: false,
          deviceModel: "Ubuntu Server",
          systemVersion: "22.04",
          appVersion: "1.0",
        }
      );

      await this._telegramClient.connect();
      console.log("✅ Telegram connected");
    }
  }

  private async _safeInsertBatch(messagesToInsert: any[]) {
    if (messagesToInsert.length === 0) return;
    try {
      console.log(`💾 Inserting ${messagesToInsert.length} messages...`);
      await this._messageRepository.insertMessages(messagesToInsert);
    } catch (insertError: any) {
      console.error(`❌ Batch insert trace caught:`, insertError.message);
    }
  }
}
