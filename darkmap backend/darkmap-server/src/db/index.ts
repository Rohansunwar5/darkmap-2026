import mongoose from 'mongoose';
import config from '../config';

const connectDB = () => {
  if (config.NODE_ENV !== 'test') {
    return mongoose.connect(config.MONGO_URI, {
    });
  }
};

export default connectDB;