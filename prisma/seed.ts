/**
 * Demo data seed.
 *
 * Creates the manager/technician test accounts, a set of clients with
 * vehicles, and a spread of trackers across every status so the UI can be
 * exercised end to end without manual setup.
 *
 * Run with:  npx prisma db seed
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient, Role, TrackerStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const USERS = [
  { username: 'manager', password: 'Manager123!', email: 'manager@camtrack.dev', fullName: 'Marc Manager', role: Role.STOCK_MANAGER },
  { username: 'tech1', password: 'Tech123!', email: 'tech1@camtrack.dev', fullName: 'Tech One', role: Role.TECHNICIAN },
];

const CLIENTS = [
  { name: 'Transport Express', phone: '+33 6 12 34 56 78', address: '12 rue de la Paix, 75002 Paris' },
  { name: 'Logistique Nord', phone: '+33 6 22 45 67 89', address: '45 avenue de Lille, 59000 Lille' },
  { name: 'Rapid Sud', phone: '+33 6 34 78 90 12', address: '8 boulevard Marseille, 13001 Marseille' },
];

// `client` is an index into CLIENTS. The first client deliberately owns three
// vehicles so the 1:N client -> vehicles relation is visible in the UI.
const VEHICLES = [
  { plate: 'AB-123-CD', brand: 'Renault', model: 'Kangoo', client: 0 },
  { plate: 'EF-456-GH', brand: 'Peugeot', model: 'Partner', client: 0 },
  { plate: 'IJ-789-KL', brand: 'Citroen', model: 'Berlingo', client: 1 },
  { plate: 'MN-012-PQ', brand: 'Mercedes', model: 'Sprinter', client: 0 },
  { plate: 'RS-345-TU', brand: 'Ford', model: 'Transit', client: 2 },
];

/** 14 trackers: 8 IN_STOCK, 4 FAULTY, 2 RETURNED. 
 * 8 IN_STOCK triggers the low stock alert (default threshold 10) */
function buildTrackers() {
  const models = ['FMB640', 'FMB920', 'GL300W', 'GV350W', 'FM420L'];
  const trackers: { imei: string; model: string; simNumber: string; status: TrackerStatus }[] = [];

  for (let i = 0; i < 14; i++) {
    trackers.push({
      imei: `352099${String(1000000 + i * 137).padStart(9, '0')}`,
      model: models[i % models.length],
      simNumber: `89310${String(2000000 + i * 211).padStart(7, '0')}`,
      status: i < 8 ? TrackerStatus.IN_STOCK : i < 12 ? TrackerStatus.FAULTY : TrackerStatus.RETURNED,
    });
  }

  return trackers;
}

async function main() {
  const users: Record<string, { id: string; role: Role }> = {};

  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: { role: u.role, passwordHash, isVerified: true },
      create: {
        username: u.username,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        passwordHash,
        isVerified: true,
      },
    });
    users[u.username] = { id: user.id, role: user.role };
    console.log(`user      ${u.username.padEnd(10)} ${u.password}`);
  }

  const managerId = users['manager'].id;
  const created = { clients: 0, vehicles: 0, trackers: 0 };

  const clientIds: string[] = [];
  for (const c of CLIENTS) {
    const client =
      (await prisma.client.findFirst({ where: { name: c.name } })) ??
      (await prisma.client.create({ data: c }));
    clientIds.push(client.id);
    created.clients++;
    console.log(`client    ${c.name} (${client.id})`);
  }

  for (const v of VEHICLES) {
    if (await prisma.vehicle.findFirst({ where: { plate: v.plate } })) continue;
    await prisma.vehicle.create({
      data: { plate: v.plate, brand: v.brand, model: v.model, clientId: clientIds[v.client] },
    });
    created.vehicles++;
    console.log(`vehicle   ${v.plate} -> ${CLIENTS[v.client].name}`);
  }

  for (const t of buildTrackers()) {
    const tracker =
      (await prisma.tracker.findUnique({ where: { imei: t.imei } })) ??
      (await prisma.tracker.create({ data: t }));
    created.trackers++;

    // Only write the RECEIVED entry once, so re-running the seed is safe.
    if ((await prisma.trackerHistory.count({ where: { trackerId: tracker.id } })) === 0) {
      await prisma.trackerHistory.create({
        data: {
          trackerId: tracker.id,
          oldStatus: null,
          newStatus: TrackerStatus.IN_STOCK,
          action: 'RECEIVED',
          userId: managerId,
        },
      });
    }
  }

  // Seed Interventions
  // Retrieve the created vehicles by plate to link them.
  const allVehicles = await prisma.vehicle.findMany();
  const tech1Id = users['tech1'].id;

  // We need tech2! The current seed only created tech1.
  let tech2Id = users['tech2']?.id;
  if (!tech2Id) {
    const pHash2 = await bcrypt.hash('Tech123!', 10);
    const tech2 = await prisma.user.upsert({
      where: { username: 'tech2' },
      update: { role: Role.TECHNICIAN, passwordHash: pHash2, isVerified: true },
      create: {
        username: 'tech2',
        email: 'tech2@camtrack.dev',
        fullName: 'Tech Two',
        role: Role.TECHNICIAN,
        passwordHash: pHash2,
        isVerified: true,
      },
    });
    tech2Id = tech2.id;
    console.log(`user      tech2        Tech123!`);
  }

  const now = new Date();
  const future = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // +2 days
  const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // -2 days

  if (allVehicles.length >= 4) {
    const interventions = [
      { clientId: allVehicles[0].clientId, vehicleId: allVehicles[0].id, technicianId: tech1Id, scheduledAt: future, address: 'Paris', status: 'PLANNED' as const },
      { clientId: allVehicles[1].clientId, vehicleId: allVehicles[1].id, technicianId: tech2Id, scheduledAt: future, address: 'Lyon', status: 'PLANNED' as const },
      { clientId: allVehicles[2].clientId, vehicleId: allVehicles[2].id, technicianId: tech1Id, scheduledAt: past, address: 'Lille', status: 'DONE' as const, completedAt: past },
      { clientId: allVehicles[3].clientId, vehicleId: allVehicles[3].id, technicianId: tech2Id, scheduledAt: past, address: 'Marseille', status: 'CANCELLED' as const },
      { clientId: allVehicles[0].clientId, vehicleId: allVehicles[0].id, technicianId: tech1Id, scheduledAt: new Date(now.getTime() + 1000 * 60 * 60), address: 'Bordeaux', status: 'PLANNED' as const }, // today
      { clientId: allVehicles[2].clientId, vehicleId: allVehicles[2].id, technicianId: tech2Id, scheduledAt: past, address: 'Nice', status: 'DONE' as const, completedAt: past },
    ];

    let interventionsCreated = 0;
    for (const inv of interventions) {
      // Check if it exists for this vehicle and time
      const existing = await prisma.intervention.findFirst({
        where: { vehicleId: inv.vehicleId, scheduledAt: inv.scheduledAt }
      });
      if (!existing) {
        await prisma.intervention.create({ data: inv });
        interventionsCreated++;
      }
    }
    console.log(`seeded ${interventionsCreated} interventions. (If 0, they were already seeded)`);
  }

  console.log(
    `\nseeded ${created.clients} clients, ${created.vehicles} vehicles, ${created.trackers} trackers ` +
    `(+ RECEIVED history)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
