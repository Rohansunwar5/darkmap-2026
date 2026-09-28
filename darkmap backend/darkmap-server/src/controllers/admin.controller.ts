import { NextFunction, Request, Response } from 'express';
import adminService from '../services/admin.service';

export const adminLogin = async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;
    const response = await adminService.login({ email, password });

    next(response);
};

export const adminSignup = async (req: Request, res: Response, next: NextFunction) => {
    const { name, number, email, password } = req.body;
    const response = await adminService.signup({ name, number, email, password });

    next(response);
};

export const adminProfile = async (req: Request, res: Response, next: NextFunction) => {
    const { _id } = req.admin;
    const response = await adminService.profile(_id);

    next(response);
};

export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    const response = await adminService.getAllUsers();
    next(response);
};
