declare namespace Express {
  export interface Request {
    user: {
      sessionId: string;
      _id: string,
      role?: 'user' | 'admin',
      teamId?: any,
      teamRole?: 'admin' | 'member' | 'none',
      isSuperAdmin?: boolean,
    },
    access_token: string | null,
  }
}