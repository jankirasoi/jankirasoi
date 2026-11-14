import { Controller, Post, Get, Patch, Delete, Param, Body, Res, Req, Query, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AdminLoginDto, RiderLoginDto, CustomerLoginDto, CreateRiderDto, ToggleRiderAvailabilityDto, BanCustomerDto, PayUnbanPenaltyDto } from './dto/auth.dto';
import { Response, Request } from 'express';

@ApiTags('Authentication')
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('auth/customer/login')
  @ApiOperation({ summary: 'Instant phone-first customer login or registration' })
  async loginCustomer(
    @Body() dto: CustomerLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginCustomer(dto);

    res.cookie('customer_session_token', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.cookie('session_token', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return result;
  }

  @Get('auth/me')
  @ApiOperation({ summary: 'Get current user session profile and saved addresses' })
  async getMe(@Req() req: Request) {
    const headerToken = req.headers.authorization?.replace('Bearer ', '');
    const cookieToken = req.cookies?.customer_session_token || req.cookies?.session_token;
    const token = headerToken || cookieToken;

    if (!token) {
      return { authenticated: false, user: null };
    }

    try {
      const data = await this.authService.getMe(token);
      return { authenticated: true, ...data };
    } catch {
      return { authenticated: false, user: null };
    }
  }

  @Patch('auth/me/addresses')
  @ApiOperation({ summary: 'Persist customer saved delivery addresses (up to 10)' })
  async updateMyAddresses(
    @Body() body: { addresses: any[] },
    @Req() req: Request,
  ) {
    const headerToken = req.headers.authorization?.replace('Bearer ', '');
    const cookieToken = req.cookies?.customer_session_token || req.cookies?.session_token;
    const token = headerToken || cookieToken;
    if (!token) {
      return { success: false, message: 'Not authenticated' };
    }
    return this.authService.updateCustomerAddresses(token, body.addresses || []);
  }

  @Get('auth/customer/status')
  @ApiOperation({ summary: 'Check customer ban and penalty status' })
  async getCustomerBanStatus(@Query('phone') phone?: string, @Req() req?: Request) {
    let checkPhone = phone;
    if (!checkPhone && req) {
      const headerToken = req.headers?.authorization?.replace('Bearer ', '');
      const cookieToken = req.cookies?.customer_session_token || req.cookies?.session_token;
      const token = headerToken || cookieToken;
      if (token) {
        try {
          const user = await this.authService.validateSessionToken(token);
          if (user?.phone) checkPhone = user.phone;
        } catch {}
      }
    }
    return this.authService.getCustomerBanStatus(checkPhone || '');
  }

  @Post('auth/customer/pay-unban-penalty')
  @ApiOperation({ summary: 'Customer pays penalty to immediately unban account' })
  async payUnbanPenalty(
    @Body() dto: PayUnbanPenaltyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.payUnbanPenalty(dto);
    if (result.sessionToken) {
      res.cookie('customer_session_token', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
      res.cookie('session_token', result.sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    }
    return result;
  }

  @Get('admin/customers')
  @ApiOperation({ summary: 'Admin list all registered customers and delivery addresses' })
  async getCustomers() {
    return this.authService.getAdminCustomers();
  }

  @Post('admin/customers/:phone/ban')
  @ApiOperation({ summary: 'Admin block/ban customer from placing orders' })
  async banCustomer(
    @Param('phone') phone: string,
    @Body() dto: BanCustomerDto,
  ) {
    return this.authService.banCustomer(phone, dto);
  }

  @Post('admin/customers/:phone/unban')
  @ApiOperation({ summary: 'Admin unban customer' })
  async unbanCustomer(@Param('phone') phone: string) {
    return this.authService.unbanCustomer(phone);
  }

  @Get('admin/customers/:phone/orders')
  @ApiOperation({ summary: 'Admin view complete order history of a customer' })
  async getCustomerOrders(@Param('phone') phone: string) {
    return this.authService.getCustomerOrders(phone);
  }

  @Get('admin/riders')
  @ApiOperation({ summary: 'Admin list all riders and vehicle details' })
  async getRiders() {
    return this.authService.getAdminRiders();
  }

  @Post('admin/riders')
  @ApiOperation({ summary: 'Admin register new delivery rider with credentials' })
  async createRider(@Body() dto: CreateRiderDto) {
    return this.authService.createAdminRider(dto);
  }

  @Patch('admin/riders/:id/availability')
  @ApiOperation({ summary: 'Admin toggle rider live duty availability' })
  async toggleRiderAvailability(
    @Param('id') riderId: string,
    @Body() dto: ToggleRiderAvailabilityDto,
  ) {
    return this.authService.toggleAdminRiderAvailability(riderId, dto.isAvailable);
  }

  @Delete('admin/riders/:id')
  @ApiOperation({ summary: 'Admin remove/delete delivery rider' })
  async deleteRider(@Param('id') riderId: string) {
    return this.authService.deleteAdminRider(riderId);
  }

  @Post('admin/auth/login')
  @ApiOperation({ summary: 'Admin/Staff authentication with HttpOnly cookie session' })
  async loginAdmin(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginAdmin(dto);

    // Set HttpOnly, Secure session cookie
    res.cookie('session_token', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/',
    });

    return result;
  }

  @Post('rider/auth/login')
  @ApiOperation({ summary: 'Rider authentication with HttpOnly cookie session' })
  async loginRider(
    @Body() dto: RiderLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginRider(dto);

    res.cookie('rider_session_token', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return result;
  }

  @Post('auth/logout')
  @ApiOperation({ summary: 'Logout and invalidate current session' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const headerToken = req.headers.authorization?.replace('Bearer ', '');
    const cookieToken = req.cookies?.customer_session_token || req.cookies?.session_token;
    const token = headerToken || cookieToken;

    if (token) {
      await this.authService.logout(token);
    }

    res.clearCookie('session_token', { path: '/' });
    res.clearCookie('customer_session_token', { path: '/' });
    res.clearCookie('rider_session_token', { path: '/' });
    return { success: true, message: 'Logged out successfully.' };
  }
}
