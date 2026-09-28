import mongoose from 'mongoose';
import { config } from './config';
import app from './app';

// Set strictQuery for mongoose v7+ preparation
mongoose.set('strictQuery', false);

mongoose.connect(config.database)
  .then(() => {
    console.log('✅ Connected to MongoDB via TS Server Architecture');
    
    app.listen(config.port as number, config.host as string, () => {
      console.log(`🚀 API running on http://${config.host}:${config.port}`);
    });
  })
  .catch((error: any) => {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    process.exit(1);
  });
