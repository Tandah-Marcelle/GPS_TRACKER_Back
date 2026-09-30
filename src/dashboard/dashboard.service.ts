import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
    constructor(private prisma: PrismaService) { }

    async getDashboardStats() {
        // 1. Group trackers by status
        const trackerGroups = await this.prisma.tracker.groupBy({
            by: ['status'],
            _count: { id: true },
        });
        const trackersByStatus = {
            IN_STOCK: 0,
            INSTALLED: 0,
            FAULTY: 0,
            RETURNED: 0,
        };
        trackerGroups.forEach((g) => {
            trackersByStatus[g.status] = g._count.id;
        });

        // 2. Interventions this week grouped by technician
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
        const startOfWeek = new Date(now);
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        const interventions = await this.prisma.intervention.findMany({
            where: {
                scheduledAt: { gte: startOfWeek, lt: endOfWeek },
            },
            select: {
                technicianId: true,
                technician: { select: { fullName: true } },
            },
        });

        const techMap = new Map<string, { technicianId: string; fullName: string; count: number }>();
        interventions.forEach((inv) => {
            const existing = techMap.get(inv.technicianId) || {
                technicianId: inv.technicianId,
                fullName: inv.technician.fullName,
                count: 0,
            };
            existing.count += 1;
            techMap.set(inv.technicianId, existing);
        });

        // Convert to array and sort by count descending
        const interventionsThisWeekPerTechnician = Array.from(techMap.values()).sort((a, b) => b.count - a.count);

        // 3. Low stock threshold alert
        const inStockCount = trackersByStatus.IN_STOCK;
        const lowStockThreshold = parseInt(process.env.LOW_STOCK_THRESHOLD || '10', 10);
        const lowStockAlert = inStockCount < lowStockThreshold;

        return {
            trackersByStatus,
            interventionsThisWeekPerTechnician,
            inStockCount,
            lowStockThreshold,
            lowStockAlert,
        };
    }
}
