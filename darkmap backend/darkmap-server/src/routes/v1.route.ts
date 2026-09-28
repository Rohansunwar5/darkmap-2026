import { Router } from 'express';
import { country, health, helloWorld } from '../controllers/health.controller';
import { asyncHandler } from '../utils/asynchandler';
import authRouter from './auth.route';
import telegramRouter from './telegram.route';
import cyberRouter from './cyber.route';
import adminRouter from './admin.route';
import ecsRouter from './ecs.route';

const v1Router = Router();

v1Router.get('/', asyncHandler(helloWorld));
v1Router.get('/health', asyncHandler(health));
v1Router.use('/auth', authRouter);
v1Router.use('/admin', adminRouter);
v1Router.use('/telegram', telegramRouter);
v1Router.use('/cyber', cyberRouter);
v1Router.use('/ecs', ecsRouter);
v1Router.get('/country', asyncHandler(country));

export default v1Router;
