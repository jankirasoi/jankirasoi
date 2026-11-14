import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersEventsService } from '../events/orders-events.service';
import { AdminLoginDto, RiderLoginDto, CustomerLoginDto, CreateRiderDto, ToggleRiderAvailabilityDto, BanCustomerDto, PayUnbanPenaltyDto } from './dto/auth.dto';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventsService?: OrdersEventsService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async createSession(userId: string) {
    const token = 'sess_' + randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await this.prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  async loginAdmin(dto: AdminLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || (user.role !== 'ADMIN' && user.role !== 'STAFF')) {
      throw new UnauthorizedException('Invalid administrative email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    const isValid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid administrative email or password.');
    }

    const session = await this.createSession(user.id);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async loginRider(dto: RiderLoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: { riderProfile: true },
    });

    if (!user || user.role !== 'RIDER') {
      throw new UnauthorizedException('Invalid rider phone number or credentials.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('This rider account is deactivated.');
    }

    const isValid = await this.verifyPassword(dto.password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid rider credentials.');
    }

    const session = await this.createSession(user.id);

    return {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        vehicleNumber: user.riderProfile?.vehicleNumber,
      },
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async validateSessionToken(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    if (!session.user || !session.user.isActive) {
      return null;
    }

    return session.user;
  }

  async loginCustomer(dto: CustomerLoginDto) {
    let cleanPhone = dto.phone.replace(/[\s\-\+]/g, '');
    if (cleanPhone.startsWith('91') && cleanPhone.length === 12) {
      cleanPhone = cleanPhone.substring(2);
    }

    if (cleanPhone.length !== 10) {
      throw new BadRequestException('Please provide a valid 10-digit Indian phone number.');
    }

    let user = await this.prisma.user.findUnique({
      where: { phone: cleanPhone },
    });

    if (!user) {
      const dummyHash = await this.hashPassword(randomBytes(16).toString('hex'));
      user = await this.prisma.user.create({
        data: {
          phone: cleanPhone,
          name: dto.name?.trim() || `Customer ${cleanPhone.slice(-4)}`,
          email: null,
          passwordHash: dummyHash,
          role: 'CUSTOMER',
          isActive: true,
        },
      });
      this.logger.log(`Created new customer account: ${user.name} (${user.phone})`);
    } else {
      // Prevent banned customer accounts from logging in
      if (!user.isActive) {
        throw new ForbiddenException(
          'Aapka account restricted/blocked hai. Unblock karwane ke liye Janki Rasoi kitchen support (+91 9755554774) par sampark karein.'
        );
      }
      // Prevent customer login from hijacking/overwriting Admin, Staff, or Rider accounts
      if (user.role !== 'CUSTOMER') {
        throw new BadRequestException('This phone number is registered for administrative or delivery fleet access. Please use your personal customer mobile number.');
      }
      if (dto.name && dto.name.trim() && user.name !== dto.name.trim()) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { name: dto.name.trim() },
        });
      }
    }

    // Retrieve previous order delivery address if any
    const recentOrders = await this.prisma.order.findMany({
      where: { customerPhone: cleanPhone },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmountPaise: true,
        deliveryAddress: true,
        trackingToken: true,
        createdAt: true,
      },
    });

    const savedAddress = dto.address || recentOrders[0]?.deliveryAddress || null;
    const session = await this.createSession(user.id);

    return {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        savedAddress,
        orderCount: recentOrders.length,
        recentOrders,
      },
      sessionToken: session.token,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async getMe(token: string) {
    const user = await this.validateSessionToken(token);
    if (!user) {
      throw new UnauthorizedException('Session expired or invalid.');
    }

    let savedAddress = null;
    let savedAddresses: any[] = [];
    let recentOrders: any[] = [];
    let riderInfo = null;
    let banDetails: any = null;

    if (user.role === 'CUSTOMER') {
      if (!user.isActive) {
        banDetails = await this.getCustomerBanStatus(user.phone);
      }

      // Load full user record to get persisted savedAddresses
      const fullUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { savedAddresses: true },
      });
      if (Array.isArray(fullUser?.savedAddresses)) {
        savedAddresses = fullUser.savedAddresses as any[];
        savedAddress = savedAddresses[0] || null;
      }

      recentOrders = await this.prisma.order.findMany({
        where: { customerPhone: user.phone },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmountPaise: true,
          deliveryAddress: true,
          trackingToken: true,
          createdAt: true,
        },
      });

      // Fall back to last order delivery address if no saved addresses exist
      if (!savedAddress) {
        savedAddress = recentOrders[0]?.deliveryAddress || null;
      }
    } else if (user.role === 'RIDER') {
      const profile = await this.prisma.riderProfile.findUnique({
        where: { userId: user.id },
      });
      riderInfo = profile;
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        isBanned: !user.isActive,
        banReason: banDetails?.reason || null,
        penaltyAmountPaise: banDetails?.penaltyAmountPaise || null,
        penaltyAmountRupees: banDetails?.penaltyAmountRupees || null,
        savedAddress,
        savedAddresses,
        orderCount: recentOrders.length,
        recentOrders,
        riderProfile: riderInfo,
      },
    };
  }

  async updateCustomerAddresses(token: string, addresses: any[]) {
    const user = await this.validateSessionToken(token);
    if (!user) {
      throw new UnauthorizedException('Session expired or invalid.');
    }
    if (user.role !== 'CUSTOMER') {
      throw new BadRequestException('Only customer accounts can save delivery addresses.');
    }

    // Keep latest 10 addresses; normalise list
    const sanitised = addresses
      .filter((a) => a && typeof a === 'object')
      .slice(0, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { savedAddresses: sanitised },
    });

    this.logger.log(`Updated saved addresses for customer ${user.phone} (${sanitised.length} addresses)`);
    return { success: true, savedAddresses: sanitised };
  }

  async getAdminCustomers() {
    // 1. Fetch registered customer users with active status
    const customerUsers = await this.prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: {
        id: true,
        name: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // 2. Aggregate order metrics grouped by customer phone
    const orderStats = await this.prisma.order.groupBy({
      by: ['customerPhone'],
      _count: { id: true },
      _sum: { totalAmountPaise: true },
      _max: { createdAt: true },
    });

    const userByPhone = new Map(customerUsers.map((u) => [u.phone, u]));
    const statsByPhone = new Map(orderStats.map((s) => [s.customerPhone, s]));

    // Collect all unique phone numbers across registered users and past orders
    const allPhones = new Set<string>();
    for (const u of customerUsers) if (u.phone) allPhones.add(u.phone);
    for (const s of orderStats) if (s.customerPhone) allPhones.add(s.customerPhone);

    const phonesList = Array.from(allPhones);

    // 3. Fetch latest order for each customer phone
    const recentOrders = await this.prisma.order.findMany({
      where: {
        customerPhone: { in: phonesList },
      },
      select: {
        customerPhone: true,
        customerName: true,
        deliveryAddress: true,
        status: true,
        totalAmountPaise: true,
        createdAt: true,
        items: {
          select: {
            productName: true,
            quantity: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['customerPhone'],
    });

    const recentOrderMap = new Map(recentOrders.map((r) => [r.customerPhone, r]));

    // 4. Fetch ban logs for any users with isActive === false
    const bannedPhones = phonesList.filter((p) => {
      const u = userByPhone.get(p);
      return u && u.isActive === false;
    });

    const banLogs = bannedPhones.length > 0 ? await this.prisma.auditLog.findMany({
      where: {
        entity: 'CUSTOMER',
        entityId: { in: bannedPhones },
        action: 'BAN_CUSTOMER',
      },
      orderBy: { createdAt: 'desc' },
      distinct: ['entityId'],
    }) : [];

    const banLogMap = new Map(banLogs.map((b) => [b.entityId, b]));

    // 5. Construct rich customer records
    const customers = phonesList.map((phone) => {
      const u = userByPhone.get(phone);
      const stats = statsByPhone.get(phone);
      const recentOrder = recentOrderMap.get(phone);
      const banLog = banLogMap.get(phone);

      const isBanned = u ? !u.isActive : false;
      const orderCount = stats?._count.id ?? 0;
      const totalSpendPaise = stats?._sum.totalAmountPaise ?? 0;

      // Customer name resolution: User profile name -> Recent order name -> Fallback
      let name = u?.name;
      if (!name || name.startsWith('Customer ')) {
        name = recentOrder?.customerName || u?.name || `Customer ${phone.slice(-4)}`;
      }

      // Ban details
      const banReason = isBanned ? (banLog?.reason || 'Account restricted by kitchen admin') : null;
      const penaltyAmountPaise = isBanned
        ? ((banLog?.newValue as any)?.penaltyAmountPaise || 0)
        : 0;

      // Customer Segmentation for Loyalty & Coupon targeting
      let segment: 'VIP' | 'REGULAR' | 'NEW' | 'BANNED' = 'NEW';
      if (isBanned) {
        segment = 'BANNED';
      } else if (orderCount >= 5 || totalSpendPaise >= 100000) {
        segment = 'VIP';
      } else if (orderCount >= 2) {
        segment = 'REGULAR';
      }

      const recentItems = recentOrder?.items?.map((it) => `${it.quantity}x ${it.productName}`) || [];

      return {
        id: u?.id,
        name,
        phone,
        isActive: !isBanned,
        isBanned,
        banReason,
        penaltyAmountPaise,
        orderCount,
        totalSpendPaise,
        lastOrderDate: stats?._max.createdAt?.toISOString() ?? u?.createdAt?.toISOString() ?? new Date().toISOString(),
        lastOrderStatus: recentOrder?.status || 'NO_ORDERS',
        recentItems,
        savedAddress: recentOrder?.deliveryAddress || null,
        segment,
      };
    });

    // Sort by last active / order date descending
    customers.sort((a, b) => new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime());

    return {
      customers,
      totalCount: customers.length,
      bannedCount: customers.filter((c) => c.isBanned).length,
      vipCount: customers.filter((c) => c.segment === 'VIP').length,
    };
  }

  async banCustomer(phone: string, dto?: BanCustomerDto) {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length < 10) {
      throw new BadRequestException('Invalid 10-digit customer phone number');
    }

    let user = await this.prisma.user.findUnique({
      where: { phone: cleanPhone },
    });

    if (!user) {
      const latestOrder = await this.prisma.order.findFirst({
        where: { customerPhone: cleanPhone },
        orderBy: { createdAt: 'desc' },
        select: { customerName: true },
      });
      const dummyHash = await this.hashPassword(randomBytes(16).toString('hex'));
      user = await this.prisma.user.create({
        data: {
          phone: cleanPhone,
          name: latestOrder?.customerName || `Customer ${cleanPhone.slice(-4)}`,
          email: null,
          passwordHash: dummyHash,
          role: 'CUSTOMER',
          isActive: false,
        },
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });
    }

    // Invalidate any active sessions for this user so they are immediately logged out
    await this.prisma.session.deleteMany({
      where: { userId: user.id },
    }).catch(() => {});

    // Log the ban event in AuditLog
    await this.prisma.auditLog.create({
      data: {
        action: 'BAN_CUSTOMER',
        actorRole: 'ADMIN',
        entity: 'CUSTOMER',
        entityId: cleanPhone,
        reason: dto?.reason || 'Fake order / unreachable phone / refused COD',
        newValue: {
          bannedAt: new Date().toISOString(),
          reason: dto?.reason || 'Fake order / unreachable phone / refused COD',
          penaltyAmountPaise: dto?.penaltyAmountPaise || 0,
        },
      },
    });

    this.logger.warn(`Admin banned customer: ${user.name} (${cleanPhone}). Reason: ${dto?.reason || 'N/A'}`);
    return {
      success: true,
      message: `Customer +91 ${cleanPhone} has been blocked from placing orders.`,
      phone: cleanPhone,
      isBanned: true,
    };
  }

  async unbanCustomer(phone: string) {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length < 10) {
      throw new BadRequestException('Invalid 10-digit customer phone number');
    }

    const user = await this.prisma.user.findUnique({
      where: { phone: cleanPhone },
    });

    if (user) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isActive: true },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        action: 'UNBAN_CUSTOMER',
        actorRole: 'ADMIN',
        entity: 'CUSTOMER',
        entityId: cleanPhone,
        reason: 'Admin cleared penalty / unbanned customer',
        newValue: {
          unbannedAt: new Date().toISOString(),
        },
      },
    });

    this.logger.log(`Admin unbanned customer: ${cleanPhone}`);
    return {
      success: true,
      message: `Customer +91 ${cleanPhone} has been unblocked.`,
      phone: cleanPhone,
      isBanned: false,
    };
  }

  async getCustomerBanStatus(phone: string) {
    const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : '';
    if (!cleanPhone || cleanPhone.length < 10) {
      return { isBanned: false, phone: cleanPhone };
    }

    const user = await this.prisma.user.findUnique({
      where: { phone: cleanPhone },
    });

    if (!user || user.isActive) {
      return { isBanned: false, phone: cleanPhone };
    }

    const latestBanLog = await this.prisma.auditLog.findFirst({
      where: {
        entity: 'CUSTOMER',
        entityId: cleanPhone,
        action: 'BAN_CUSTOMER',
      },
      orderBy: { createdAt: 'desc' },
    });

    const penaltyPaise = (latestBanLog?.newValue as any)?.penaltyAmountPaise ?? 25000;
    const reason = latestBanLog?.reason || 'Customer phone unreachable / COD delivery unfulfilled';

    return {
      isBanned: true,
      phone: cleanPhone,
      name: user.name || 'Customer',
      reason,
      penaltyAmountPaise: penaltyPaise,
      penaltyAmountRupees: Math.round(penaltyPaise / 100),
      bannedAt: latestBanLog?.createdAt?.toISOString() || null,
    };
  }

  async payUnbanPenalty(dto: PayUnbanPenaltyDto) {
    const cleanPhone = dto.phone ? dto.phone.replace(/\D/g, '').slice(-10) : '';
    if (!cleanPhone || cleanPhone.length < 10) {
      throw new BadRequestException('Valid 10-digit customer mobile number is required.');
    }

    let user = await this.prisma.user.findUnique({
      where: { phone: cleanPhone },
    });

    if (!user) {
      throw new NotFoundException(`Customer account with phone ${cleanPhone} not found.`);
    }

    // Set user to active
    user = await this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: true },
    });

    const txn = dto.transactionRef || `TXN_${Date.now().toString(36).toUpperCase()}`;
    await this.prisma.auditLog.create({
      data: {
        action: 'UNBAN_CUSTOMER',
        actorRole: 'CUSTOMER',
        entity: 'CUSTOMER',
        entityId: cleanPhone,
        reason: `Customer cleared penalty via online payment (${dto.paymentMethod || 'UPI'}, Txn: ${txn})`,
        newValue: {
          unbannedAt: new Date().toISOString(),
          paymentMethod: dto.paymentMethod || 'UPI',
          transactionRef: txn,
        },
      },
    });

    // ponytail: notify admin real-time SSE stream about penalty payment & unban
    if (this.eventsService) {
      try {
        const latestBanLog = await this.prisma.auditLog.findFirst({
          where: { entity: 'CUSTOMER', entityId: cleanPhone, action: 'BAN_CUSTOMER' },
          orderBy: { createdAt: 'desc' },
        });
        const penaltyPaise = (latestBanLog?.newValue as any)?.penaltyAmountPaise ?? 25000;
        this.eventsService.emitOrderEvent('CUSTOMER_UNBANNED', {
          phone: cleanPhone,
          customerName: user.name,
          penaltyAmount: Math.round(penaltyPaise / 100),
        });
      } catch (err) {
        this.logger.warn(`Failed to emit CUSTOMER_UNBANNED event: ${err}`);
      }
    }

    const session = await this.createSession(user.id);

    return {
      success: true,
      message: `Account +91 ${cleanPhone} has been successfully unbanned! You can now place orders.`,
      isBanned: false,
      phone: cleanPhone,
      sessionToken: session.token,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isActive: true,
        isBanned: false,
      },
    };
  }

  async getCustomerOrders(phone: string) {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const orders = await this.prisma.order.findMany({
      where: { customerPhone: cleanPhone },
      include: {
        items: true,
        deliverySlot: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return {
      phone: cleanPhone,
      orderCount: orders.length,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        totalAmountPaise: o.totalAmountPaise,
        subtotalPaise: o.subtotalPaise,
        deliveryAddress: o.deliveryAddress,
        deliveryNotes: o.deliveryNotes,
        slotLabel: o.deliverySlot?.label || 'Standard',
        createdAt: o.createdAt.toISOString(),
        items: o.items.map((i) => ({
          name: i.productName,
          variant: i.variantName,
          quantity: i.quantity,
          totalPricePaise: i.totalPricePaise,
          unitPricePaise: i.unitPricePaise,
        })),
      })),
    };
  }

  async getAdminRiders() {
    const riders = await this.prisma.user.findMany({
      where: { role: 'RIDER' },
      include: {
        riderProfile: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = await Promise.all(
      riders.map(async (r) => {
        let profile = r.riderProfile;
        if (!profile) {
          try {
            profile = await this.prisma.riderProfile.create({
              data: {
                userId: r.id,
                vehicleNumber: 'MP-09-JR-2026',
                isAvailable: true,
              },
            });
          } catch {
            profile = await this.prisma.riderProfile.findUnique({ where: { userId: r.id } });
          }
        }
        return {
          id: profile?.id || r.id,
          userId: r.id,
          name: r.name,
          phone: r.phone,
          vehicleNumber: profile?.vehicleNumber || 'MP-09-JR-2026',
          isAvailable: profile?.isAvailable ?? true,
          isActive: r.isActive,
        };
      }),
    );

    return {
      riders: result,
    };
  }

  async createAdminRider(dto: CreateRiderDto) {
    const phone = dto.phone.trim().replace(/\D/g, '');
    if (!phone) {
      throw new BadRequestException('Valid phone number is required');
    }

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new BadRequestException(`A user with phone number ${phone} is already registered`);
    }

    const password = dto.password?.trim() || '200720';
    const passwordHash = await this.hashPassword(password);
    const vehicleNumber = dto.vehicleNumber?.trim() || 'MP-09-JR-2026';

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        phone,
        passwordHash,
        role: 'RIDER',
        isActive: true,
        riderProfile: {
          create: {
            vehicleNumber,
            isAvailable: true,
          },
        },
      },
      include: { riderProfile: true },
    });

    return {
      success: true,
      rider: {
        id: user.riderProfile?.id || user.id,
        userId: user.id,
        name: user.name,
        phone: user.phone,
        vehicleNumber: user.riderProfile?.vehicleNumber,
        isAvailable: user.riderProfile?.isAvailable,
        isActive: user.isActive,
      },
    };
  }

  async toggleAdminRiderAvailability(riderId: string, isAvailable: boolean) {
    const profile = await this.prisma.riderProfile.findFirst({
      where: {
        OR: [{ id: riderId }, { userId: riderId }],
      },
    });

    if (!profile) {
      throw new BadRequestException(`Rider profile ${riderId} not found`);
    }

    const updated = await this.prisma.riderProfile.update({
      where: { id: profile.id },
      data: { isAvailable },
      include: { user: true },
    });

    return {
      success: true,
      rider: {
        id: updated.id,
        userId: updated.userId,
        name: updated.user.name,
        phone: updated.user.phone,
        vehicleNumber: updated.vehicleNumber,
        isAvailable: updated.isAvailable,
        isActive: updated.user.isActive,
      },
    };
  }

  async deleteAdminRider(riderId: string) {
    const profile = await this.prisma.riderProfile.findFirst({
      where: {
        OR: [{ id: riderId }, { userId: riderId }],
      },
      include: { user: true },
    });

    if (!profile) {
      throw new BadRequestException(`Rider profile ${riderId} not found`);
    }

    // Delete active sessions and assignments for this rider
    await this.prisma.session.deleteMany({ where: { userId: profile.userId } });
    await this.prisma.riderAssignment.deleteMany({ where: { riderId: profile.id } });
    await this.prisma.riderProfile.delete({ where: { id: profile.id } });
    await this.prisma.user.delete({ where: { id: profile.userId } });

    return { success: true, message: 'Rider deleted successfully' };
  }

  async logout(token: string) {
    await this.prisma.session.deleteMany({
      where: { token },
    });
    return { success: true, message: 'Logged out successfully.' };
  }
}
