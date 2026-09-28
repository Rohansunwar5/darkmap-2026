import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string, {
      maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '10'),
      serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT || '5000'),
      socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT || '45000'),
      bufferCommands: false,
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('x => MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('x => MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('O => MongoDB reconnected');
    });

    console.log('=> MongoDB connected with production settings');
  } catch (error) {
    console.error('X => MongoDB connection failed:', error);
    process.exit(1);
  }
};

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('D => MongoDB connection closed');
  process.exit(0);
});

export default connectDB;
