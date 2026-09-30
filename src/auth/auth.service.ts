import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../common/email/email.service';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  private generateExpiry(): Date {
    return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  }

  private signToken(user: { id: string; username: string; role: string }) {
    const payload = { sub: user.id, username: user.username, role: user.role };
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '7d';
    return this.jwtService.sign(payload, { expiresIn } as any);
  }

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');
    const { passwordHash, otp, otpExpiresAt, ...result } = user as any;
    return result;
  }

  async register(data: { username: string; email: string; password: string; fullName: string; role?: Role }) {
    const existingUsername = await this.prisma.user.findUnique({ where: { username: data.username } });
    if (existingUsername) throw new ConflictException('Username already taken');
    const existingEmail = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existingEmail) throw new ConflictException('Email already taken');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const otp = this.emailService.generateOtp();
    const otpExpiresAt = this.generateExpiry();
    const role = data.role || Role.TECHNICIAN;

    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        role,
        isVerified: false,
        otp,
        otpExpiresAt,
      },
    });

    await this.emailService.sendOtpEmail(data.email, otp, 'register');

    const { passwordHash: _, otp: __, otpExpiresAt: ___, ...result } = user;
    return { message: 'Registration successful. OTP sent to email.', email: data.email, user: result, devOtp: otp };
  }

  async verifyOtp(email: string, otp: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('User not found');
    if (user.isVerified) throw new BadRequestException('Already verified');
    if (!user.otp || !user.otpExpiresAt) throw new BadRequestException('No OTP found. Please register again.');
    if (user.otp !== otp) throw new BadRequestException('Invalid OTP');
    if (new Date() > user.otpExpiresAt) throw new BadRequestException('OTP expired');

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, otp: null, otpExpiresAt: null },
    });
    const { passwordHash, otp: __, otpExpiresAt: ___, ...result } = updated;
    const accessToken = this.signToken(result as any);
    return { accessToken, user: result, message: 'Email verified successfully' };
  }

  async login(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');
    if (!user.isVerified) throw new UnauthorizedException('Please verify your email with OTP first');
    if (!user.email) throw new BadRequestException('No email associated with account');

    const otp = this.emailService.generateOtp();
    const otpExpiresAt = this.generateExpiry();
    await this.prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiresAt } });
    await this.emailService.sendOtpEmail(user.email, otp, 'login');

    return { message: 'OTP sent to email', email: user.email, devOtp: otp };
  }

  // Direct login for legacy (bypass OTP) - used for testing if needed
  async loginDirect(username: string, password: string) {
    const user = await this.validateUser(username, password);
    const accessToken = this.signToken(user as any);
    return { accessToken, user };
  }

  async verifyLoginOtp(email: string, otp: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('User not found');
    if (!user.otp || !user.otpExpiresAt) throw new BadRequestException('No OTP found. Please login again.');
    if (user.otp !== otp) throw new BadRequestException('Invalid OTP');
    if (new Date() > user.otpExpiresAt) throw new BadRequestException('OTP expired');

    await this.prisma.user.update({ where: { id: user.id }, data: { otp: null, otpExpiresAt: null } });
    const { passwordHash, otp: __, otpExpiresAt: ___, ...result } = user;
    const accessToken = this.signToken(result as any);
    return { accessToken, user: result };
  }
}
