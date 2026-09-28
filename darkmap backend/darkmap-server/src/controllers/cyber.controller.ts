import { Request, Response, NextFunction } from "express";
import cyberService from "../services/cyber.service";

export const ransomwareSearch = async (req: Request, res: Response, next: NextFunction) => {
    const { query } = req.body;
    const data = await cyberService.ransomwareSearch(query);

    next(data);
}

export const darkwebSearch = async (req: Request, res: Response, next: NextFunction) => {
    const { query } = req.body;
    const data = await cyberService.darkwebSearch(query);

    next(data);
}

export const breachforumsSearch = async (req: Request, res: Response, next: NextFunction) => {
    const { query, pages } = req.body;
    const data = await cyberService.breachforumsSearch(query, pages || 5);

    next(data);
}

export const hackcheckSearch = async (req: Request, res: Response, next: NextFunction) => {
    const { query } = req.body;
    const data = await cyberService.hackcheckSearch(query);

    next(data);
}