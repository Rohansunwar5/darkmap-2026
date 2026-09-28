import { NextFunction, Request, Response } from 'express';
import ecsService from '../services/ecs.service';

export const deleteInfrastructure = async (req: Request, res: Response, next: NextFunction) => {
    const response = await ecsService.deleteInfrastructure();

    next(response);
};

export const createInfrastructure = async (req: Request, res: Response, next: NextFunction) => {
    const response = await ecsService.createInfrastructure();

    next(response);
};

export const deleteInfrastructure2 = async (req: Request, res: Response, next: NextFunction) => {
    const response = await ecsService.deleteInfrastructure2();

    next(response);
};

export const createInfrastructure2 = async (req: Request, res: Response, next: NextFunction) => {
    const response = await ecsService.createInfrastructure2();

    next(response);
};

export const startServices = async (req: Request, res: Response, next: NextFunction) => {
    const response = await ecsService.startServices();

    next(response);
};
