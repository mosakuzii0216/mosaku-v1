import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, IStrategyOption } from 'passport-twitter';
import { AuthService } from './auth.service';

@Injectable()
export class XStrategy extends PassportStrategy(Strategy, 'x') {
  constructor(private readonly authService: AuthService) {
    super({
      consumerKey: process.env.X_CONSUMER_KEY!,
      consumerSecret: process.env.X_CONSUMER_SECRET!,
      callbackURL: process.env.X_REDIRECT_URI!,
      includeEmail: true,
    } as IStrategyOption);
  }

  async validate(
    token: string,
    tokenSecret: string,
    profile: any,
  ): Promise<any> {
    const { id, username, displayName, emails, photos } = profile;

    const user = {
      xId: id,
      email: emails?.[0]?.value,
      username,
      name: displayName || username,
      picture: photos?.[0]?.value,
      accessToken: token,
      tokenSecret,
    };

    return user;
  }
}