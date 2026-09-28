import adminModel, { IAdmin } from '../models/admin.model';

export interface ICreateAdminParams {
    name: string;
    number: string;
    email: string;
    password: string;
}

export class AdminRepository {
    private _model = adminModel;

    async getAdminByEmail(email: string): Promise<IAdmin | null> {
        return this._model.findOne({ email });
    }

    async createAdmin(params: ICreateAdminParams): Promise<IAdmin> {
        const { name, number, email, password } = params;
        return this._model.create({ name, number, email, password });
    }

    async getAdminById(id: string): Promise<IAdmin | null> {
        return this._model.findById(id).select('_id name number email createdAt updatedAt __v');
    }
}
