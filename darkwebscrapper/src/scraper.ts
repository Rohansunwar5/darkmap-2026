import mongoose from 'mongoose';
import { config } from './config';
import { MessageRepository } from './repository/message.repository';
import { ScraperService } from './services/scraper.service';

process.on('uncaughtException', (err) => {
  console.error('\n💥 UNCAUGHT EXCEPTION PREVENTED CRASH:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 UNHANDLED REJECTION PREVENTED CRASH at:', promise, 'reason:', reason);
});

async function runScraper() {
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(config.database);
    console.log('✅ Connected to MongoDB natively for standalone scraper');

    // Dependency Injection strictly followed
    const repository = new MessageRepository();
    const scraperService = new ScraperService(repository);

    // Enter infinite loop gracefully
    await scraperService.start();

  } catch (error: any) {
    console.error('❌ Failed to start standalone scraper:', error.message);
    process.exit(1);
  }
}

runScraper();
