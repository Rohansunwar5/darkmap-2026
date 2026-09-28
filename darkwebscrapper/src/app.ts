import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import messageRoutes from './routes/message.route';
import { globalHandler } from './middlewares/globalHandler';

const app = express();

app.use(express.json());
app.use(morgan('dev'));
app.use(cors());

// You originally had /search at the root level, but best practice usually moves this to /api
// For compatibility with old system:
app.use('/', messageRoutes);

// Global unified response and error handler (4 parameters tell Express this is an error handler middleware)
app.use(globalHandler);

export default app;
