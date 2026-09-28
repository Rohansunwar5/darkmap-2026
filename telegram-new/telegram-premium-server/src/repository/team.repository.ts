import teamModel, { ITeam } from '../models/team.model';
import { NotFoundError } from '../errors/not-found.error';

export class TeamRepository {
  public async findById(id: string): Promise<ITeam | null> {
    return await teamModel.findById(id).lean();
  }

  public async findByIdOrThrow(id: string): Promise<ITeam> {
    const team = await this.findById(id);
    if (!team) {
      throw new NotFoundError('Team not found');
    }
    return team;
  }

  public async create(data: Partial<ITeam>): Promise<ITeam> {
    const team = new teamModel(data);
    return await team.save();
  }

  public async updateMembers(teamId: string, members: string[]): Promise<ITeam | null> {
    return await teamModel.findByIdAndUpdate(
      teamId,
      { members },
      { new: true }
    ).lean();
  }
}
